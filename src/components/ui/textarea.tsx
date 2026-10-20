import { fieldClass } from "./field-styles";

export function Textarea({
  className,
  rows = 4,
  ...props
}: React.ComponentProps<"textarea">) {
  return <textarea rows={rows} className={fieldClass(className)} {...props} />;
}
