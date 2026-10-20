import { fieldClass } from "./field-styles";

/**
 * A styled native `<select>`. Native on purpose: it is keyboard and screen
 * reader accessible everywhere, uses the platform picker on phones, and
 * copes with long lists such as the ~400 time zones.
 */
export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return <select className={fieldClass(className)} {...props} />;
}
