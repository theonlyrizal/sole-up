import { Icon } from "@/components/icons/icon";
import { fieldClass } from "./field-styles";

/** Native so platform pickers, form semantics and long lists work as usual. */
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
      <Icon name="expand_more" size={20} className="native-select-icon" />
    </span>
  );
}
