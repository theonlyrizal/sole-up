import { fieldClass } from "./field-styles";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={fieldClass(className)} {...props} />;
}
