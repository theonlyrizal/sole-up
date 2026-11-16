import { fieldClass } from "./field-styles";

/** A native form control with a styled picker where the browser supports it. */
export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  if (props.multiple || (props.size ?? 1) > 1) {
    return <select className={fieldClass(className)} {...props} />;
  }
  return (
    <span className="native-select">
      <select className={fieldClass(className)} {...props} />
      <span aria-hidden="true" className="native-select-icon" />
    </span>
  );
}
