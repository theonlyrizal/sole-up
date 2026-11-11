import { createHash } from "node:crypto";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = ts.readConfigFile(
  fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
  ts.sys.readFile,
);
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
  );
const project = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const sources = ts.sys.readDirectory(
  root,
  [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"],
  ["**/node_modules/**"],
  ["src/**/*", "app/**/*", "pages/**/*"],
);
const program = ts.createProgram(sources, project.options);
const checker = program.getTypeChecker();
const methods = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
const actionModule = "src/server/auth/authed-action.ts";
const sessionModule = "src/server/auth/session.ts";

type Checks = { auth: string; input: string; owner: string };
type Review = { hash: string; endpoints: Record<string, Checks> };

// These endpoints use a deliberately different security boundary. A source
// change invalidates the review. Verify the boundary before updating its hash.
const reviewed: Record<string, Review> = {
  "src/app/manifest.ts": {
    hash: "154369b4a7d56a0d206a3d4a4c5cd2103a7f459e876d0a4367ecc48e63e30d4f",
    endpoints: {
      GET: {
        auth: "public PWA manifest",
        input: "no request input",
        owner: "static app metadata only",
      },
    },
  },
  "src/app/api/auth/[...all]/route.ts": {
    hash: "18e32df96a225a1d79c80494cb7ec879767cfc84f36d81d3ec9d59bb5b5238ae",
    endpoints: {
      GET: {
        auth: "Better Auth session / OAuth state",
        input: "Better Auth endpoint schemas",
        owner: "Better Auth session or provider identity",
      },
      POST: {
        auth: "Better Auth session / origin checks",
        input: "Better Auth endpoint schemas",
        owner: "Better Auth session or provider identity",
      },
    },
  },
  "src/app/api/health/route.ts": {
    hash: "8f4b45fbd646f19af23d47f3c0eb998b8b22494a807e26231d90bc31d3e629a9",
    endpoints: {
      GET: {
        auth: "public health probe",
        input: "no application input",
        owner: "database liveness only",
      },
    },
  },
  "src/app/api/reminders/sweep/route.ts": {
    hash: "7c45eac1f0660ed654b45baa5d2018f8633b54ab6b6f33da9d30a24e916132df",
    endpoints: {
      POST: {
        auth: "constant-time scheduler Bearer check",
        input: "Bearer credential only",
        owner: "authorized system-wide job",
      },
    },
  },
  "src/app/api/test/sign-in/route.ts": {
    hash: "ef3e7c2312de8a04d0d9306599b95e41486a2412896937b9f2d226948165ae94",
    endpoints: {
      POST: {
        auth: "NODE_ENV=test plus explicit test flag",
        input: "bodySchema.safeParse",
        owner: "test user and session fixture only",
      },
    },
  },
  "src/app/(public)/test-errors/actions.ts": {
    hash: "e144f1d54223df72d7fe7811be7dbccd0797ab27636cbddbafe70d0db48edf21",
    endpoints: {
      forceActionError: {
        auth: "authedAction plus test gate",
        input: "Zod object",
        owner: "no data access",
      },
    },
  },
  "src/server/modules/account-deletion/actions.ts": {
    hash: "553261f562a8f3b948971ca2240a6c37b74793294bff459b950ff94b97464ff4",
    endpoints: {
      confirmAccountReactivation: {
        auth: "Better Auth DB session permits pending accounts",
        input: "no action arguments",
        owner: "verified user and session IDs",
      },
    },
  },
};

function pathOf(file: ts.SourceFile) {
  return relative(root, file.fileName).replaceAll("\\", "/");
}

function usesServer(statements: ts.NodeArray<ts.Statement>) {
  for (const statement of statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    )
      return false;
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function descendants(node: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  function visit(child: ts.Node) {
    nodes.push(child);
    child.forEachChild(visit);
  }
  node.forEachChild(visit);
  return nodes;
}

function unalias(symbol: ts.Symbol | undefined) {
  return symbol && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function isImport(node: ts.Expression, name: string, file: string) {
  const symbol = unalias(checker.getSymbolAtLocation(node));
  return (
    symbol?.getName() === name &&
    symbol.declarations?.some(
      (declaration) => pathOf(declaration.getSourceFile()) === file,
    )
  );
}

function checkScope(
  body: ts.Node,
  isOwner: (arg: ts.Expression | undefined) => boolean,
) {
  const nodes = descendants(body);
  const directDatabaseAccess = nodes.some(
    (node) =>
      ts.isIdentifier(node) &&
      unalias(checker.getSymbolAtLocation(node))?.declarations?.some(
        (declaration) =>
          pathOf(declaration.getSourceFile()).startsWith("src/server/db/"),
      ),
  );
  if (directDatabaseAccess) return [];

  // Enforce the owner argument at the service boundary. The queries in each
  // service still need review and cross-user integration tests.
  const serviceCalls = [body, ...nodes]
    .filter(ts.isCallExpression)
    .filter((call) => {
      const declaration = checker.getResolvedSignature(call)?.declaration;
      return (
        declaration &&
        pathOf(declaration.getSourceFile()).startsWith("src/server/modules/")
      );
    });
  if (
    serviceCalls.some((call) => {
      const ownerParam = checker.getResolvedSignature(call)?.getParameters()[0];
      return ownerParam?.getName() !== "userId" || !isOwner(call.arguments[0]);
    })
  )
    return [];
  return serviceCalls;
}

function checkAction(declaration: ts.Declaration | undefined): Checks {
  const checks: Checks = {
    auth: "MISSING",
    input: "MISSING",
    owner: "MISSING",
  };
  if (!declaration || !ts.isVariableDeclaration(declaration)) return checks;
  const call = declaration.initializer;
  if (
    !call ||
    !ts.isCallExpression(call) ||
    !isImport(call.expression, "authedAction", actionModule)
  )
    return checks;
  checks.auth = "authedAction (active DB session)";
  const [schema, handler] = call.arguments;
  if (schema && checker.getTypeAtLocation(schema).getProperty("safeParseAsync"))
    checks.input = "authedAction schema";
  if (
    !handler ||
    (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler))
  )
    return checks;
  const context = handler.parameters[1]?.name;
  if (!context || !ts.isObjectBindingPattern(context)) return checks;
  const owner = context.elements.find(
    ({ name, propertyName, initializer }) =>
      ts.isIdentifier(name) &&
      (propertyName ?? name).getText() === "userId" &&
      !initializer,
  );
  if (!owner) return checks;
  const ownerSymbol = checker.getSymbolAtLocation(owner.name);
  const calls = checkScope(
    handler.body,
    (arg) => !!arg && checker.getSymbolAtLocation(arg) === ownerSymbol,
  );
  if (calls.length) checks.owner = "session userId passed to all services";
  return checks;
}

function awaitedCall(expression: ts.Expression | undefined) {
  if (expression && ts.isAwaitExpression(expression))
    expression = expression.expression;
  return expression && ts.isCallExpression(expression) ? expression : undefined;
}

function guardedBinding(
  statement: ts.Statement | undefined,
  guard: ts.Statement | undefined,
  property?: string,
) {
  if (
    !statement ||
    !ts.isVariableStatement(statement) ||
    !guard ||
    !ts.isIfStatement(guard) ||
    guard.elseStatement
  )
    return;
  const [binding, extra] = statement.declarationList.declarations;
  if (
    !binding ||
    extra ||
    !ts.isIdentifier(binding.name) ||
    !(statement.declarationList.flags & ts.NodeFlags.Const)
  )
    return;
  const condition = guard.expression;
  if (
    !ts.isPrefixUnaryExpression(condition) ||
    condition.operator !== ts.SyntaxKind.ExclamationToken
  )
    return;
  const value = condition.operand;
  const checked =
    property &&
    ts.isPropertyAccessExpression(value) &&
    value.name.text === property
      ? value.expression
      : value;
  if (
    (property && checked === value) ||
    checker.getSymbolAtLocation(checked) !==
      checker.getSymbolAtLocation(binding.name)
  )
    return;
  const branch = guard.thenStatement;
  const last = ts.isBlock(branch) ? branch.statements.at(-1) : branch;
  if (!last || !ts.isReturnStatement(last)) return;
  return binding;
}

function checkRoute(
  declaration: ts.Declaration | undefined,
  method: string,
): Checks {
  const checks: Checks = {
    auth: "MISSING",
    input: "MISSING",
    owner: "MISSING",
  };
  if (
    !declaration ||
    !ts.isFunctionDeclaration(declaration) ||
    !declaration.body
  )
    return checks;
  const { body, parameters } = declaration;
  const statements = body.statements;
  const request = parameters[0]?.name;
  if (!request || !ts.isIdentifier(request)) return checks;
  const requestSymbol = checker.getSymbolAtLocation(request);
  const requestUses = descendants(body).filter(
    (node) =>
      ts.isIdentifier(node) &&
      checker.getSymbolAtLocation(node) === requestSymbol,
  );
  const headersOnly = requestUses.every(
    (node) =>
      ts.isPropertyAccessExpression(node.parent) &&
      node.parent.expression === node &&
      node.parent.name.text === "headers",
  );
  let user: ts.VariableDeclaration | undefined;
  let authIndex = -1;
  for (const [index, statement] of statements.entries()) {
    const binding = guardedBinding(statement, statements[index + 1]);
    const session = awaitedCall(binding?.initializer);
    const headers = session?.arguments[0];
    if (
      session &&
      headers &&
      ts.isPropertyAccessExpression(headers) &&
      headers.name.text === "headers" &&
      checker.getSymbolAtLocation(headers.expression) === requestSymbol &&
      isImport(session.expression, "getUserFromHeaders", sessionModule)
    ) {
      user = binding;
      authIndex = index;
      break;
    }
  }
  if (!user) return checks;
  checks.auth = "getUserFromHeaders + early rejection";
  const ownerSymbol = checker.getSymbolAtLocation(user.name);
  const calls = checkScope(
    body,
    (arg) =>
      !!arg &&
      ts.isPropertyAccessExpression(arg) &&
      arg.name.text === "id" &&
      checker.getSymbolAtLocation(arg.expression) === ownerSymbol,
  );
  if (
    calls.length &&
    calls.every((call) => call.getStart() > statements[authIndex + 1].end)
  ) {
    checks.owner = "session user.id passed to all services";
  }
  if (method === "GET" && parameters.length === 1 && headersOnly) {
    checks.input = "no route or body input";
    return checks;
  }
  for (const [index, statement] of statements.entries()) {
    if (index <= authIndex + 1) continue;
    const parsed = guardedBinding(statement, statements[index + 1], "success");
    const call = awaitedCall(parsed?.initializer);
    if (
      !parsed ||
      !call ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== "safeParse" ||
      !checker
        .getTypeAtLocation(call.expression.expression)
        .getProperty("safeParseAsync")
    )
      continue;
    const parsedSymbol = checker.getSymbolAtLocation(parsed.name);
    if (
      calls.length &&
      calls.every(
        (service) =>
          service.getStart() > statements[index + 1].end &&
          service.arguments
            .slice(1)
            .every(
              (arg) =>
                ts.isPropertyAccessExpression(arg) &&
                arg.name.text === "data" &&
                checker.getSymbolAtLocation(arg.expression) === parsedSymbol,
            ),
      )
    )
      checks.input = "Zod safeParse + early rejection";
  }
  return checks;
}

let actions = 0;
let handlers = 0;
let failures = 0;
const seenReviews = new Set<string>();

function print(
  kind: string,
  file: ts.SourceFile,
  name: string,
  checks: Checks,
) {
  const path = pathOf(file);
  const review = reviewed[path];
  if (review?.endpoints[name]) {
    seenReviews.add(`${path}#${name}`);
    const hash = createHash("sha256")
      .update(file.text.replaceAll("\r\n", "\n"))
      .digest("hex");
    if (hash === review.hash) checks = review.endpoints[name];
    else {
      console.error(
        `Review the changed security boundary at ${path}#${name} (SHA-256 ${hash}).`,
      );
      failures++;
    }
  }
  if (Object.values(checks).includes("MISSING")) failures++;
  console.log(
    `${kind} ${path}#${name} | auth: ${checks.auth} | validation: ${checks.input} | scope: ${checks.owner}`,
  );
  return checks;
}

const sourceFiles = program
  .getSourceFiles()
  .filter(
    (file) =>
      !file.isDeclarationFile &&
      !program.isSourceFileFromExternalLibrary(file) &&
      !pathOf(file).startsWith("../"),
  );
for (const file of sourceFiles.sort((a, b) =>
  a.fileName.localeCompare(b.fileName),
)) {
  const path = pathOf(file);
  const route = /^(?:src\/)?app\/(?:.*\/)?route\.(?:tsx?|jsx?)$/.test(path);
  const metadataRoute =
    /^(?:src\/)?app\/(?:.*\/)?(?:manifest|robots|sitemap|icon\d*|apple-icon\d*|opengraph-image\d*|twitter-image\d*)\.(?:tsx?|jsx?)$/.test(
      path,
    );
  const pagesApi = /^(?:src\/)?pages\/api\/.*\.(?:tsx?|jsx?)$/.test(path);
  const serverModule = usesServer(file.statements);
  const moduleSymbol = checker.getSymbolAtLocation(file);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  const inline = new Set<ts.Node>();
  const routeChecks = new Map<string, Checks>();
  for (const symbol of exports) {
    const name = symbol.getName();
    const value = unalias(symbol);
    const declaration = value?.valueDeclaration;
    if (serverModule && value && value.flags & ts.SymbolFlags.Value) {
      actions++;
      if (declaration) inline.add(declaration);
      print("ACTION", file, name, checkAction(declaration));
    }
    if (
      (route && methods.has(name)) ||
      ((pagesApi || metadataRoute) && name === "default")
    ) {
      handlers++;
      const method = metadataRoute ? "GET" : name;
      routeChecks.set(
        method,
        print("ROUTE ", file, method, checkRoute(declaration, method)),
      );
    }
  }
  if (routeChecks.has("GET") && !routeChecks.has("HEAD")) {
    print("AUTO  ", file, "HEAD", routeChecks.get("GET")!);
  }
  if (
    routeChecks.size &&
    (route || metadataRoute) &&
    !routeChecks.has("OPTIONS")
  ) {
    print("AUTO  ", file, "OPTIONS", {
      auth: "Next.js method discovery",
      input: "none",
      owner: "none",
    });
  }
  for (const node of descendants(file)) {
    if (
      !ts.isFunctionLike(node) ||
      !("body" in node) ||
      !node.body ||
      !ts.isBlock(node.body) ||
      !usesServer(node.body.statements) ||
      inline.has(node)
    )
      continue;
    actions++;
    const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    print("ACTION", file, `inline:${line}`, checkAction(undefined));
  }
}

for (const [file, review] of Object.entries(reviewed)) {
  for (const name of Object.keys(review.endpoints)) {
    if (seenReviews.has(`${file}#${name}`)) continue;
    console.error(`Remove the stale security review at ${file}#${name}.`);
    failures++;
  }
}
if (!actions || !handlers) failures++;
console.log(
  `\n${actions} Server Actions, ${handlers} route handlers. ${failures ? `${failures} security checks failed.` : "No unguarded endpoints found."}`,
);
process.exitCode = failures ? 1 : 0;
