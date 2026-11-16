"use client";

import { useRef, useState } from "react";
import { cx, focusRing } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import {
  PickerActions,
  PickerDialog,
  PickerTitle,
} from "@/components/ui/picker-dialog";

type TimeSelectionProps = {
  trigger: React.ReactElement;
  value: string;
  locale: string;
  onChange: (value: string) => void;
  onClear?: () => void;
};

type Unit = "hour" | "minute";
const pad = (value: number) => String(value).padStart(2, "0");
const ticks = Array.from({ length: 12 }, (_, index) => index);

function tickPosition(index: number, radius: number) {
  const angle = (index / 12) * Math.PI * 2;
  return {
    left: `${(50 + radius * Math.sin(angle)).toFixed(3)}%`,
    top: `${(50 - radius * Math.cos(angle)).toFixed(3)}%`,
  };
}

export function TimeSelectionDialog({ trigger, ...props }: TimeSelectionProps) {
  return (
    <PickerDialog trigger={trigger} className="time-selection-dialog">
      <TimeSelection {...props} />
    </PickerDialog>
  );
}

function TimeSelection({
  value,
  locale,
  onChange,
  onClear,
}: Omit<TimeSelectionProps, "trigger">) {
  const twelveHours = Boolean(
    new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions()
      .hour12,
  );
  const [initialHour, initialMinute] =
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
      ? value.split(":").map(Number)
      : [0, 0];
  const [hour, setHour] = useState(
    pad(twelveHours ? initialHour! % 12 || 12 : initialHour!),
  );
  const [minute, setMinute] = useState(pad(initialMinute!));
  const [isPm, setPm] = useState(initialHour! >= 12);
  const [typing, setTyping] = useState(false);
  const [unit, setUnit] = useState<Unit>("hour");
  const [angle, setAngle] = useState((initialHour! % 12) * 30);
  const confirm = useRef<HTMLButtonElement>(null);
  const minimum = twelveHours ? 1 : 0;
  const maximum = twelveHours ? 12 : 23;
  const validHour =
    hour !== "" && Number(hour) >= minimum && Number(hour) <= maximum;
  const validMinute = minute !== "" && Number(minute) <= 59;
  const valid = validHour && validMinute;
  const currentHour = validHour ? Number(hour) : minimum;
  const currentMinute = validMinute ? Number(minute) : 0;
  const hours = unit === "hour";
  const selected = hours ? currentHour : currentMinute;
  const inner = hours && !twelveHours && (selected === 0 || selected > 12);
  const dialMin = hours ? minimum : 0;
  const dialMax = hours ? maximum : 59;

  function rotateTo(nextUnit: Unit, next: number) {
    const degrees = nextUnit === "hour" ? (next % 12) * 30 : next * 6;
    setAngle((previous) => {
      const turns = Math.round((previous - degrees) / 360);
      return degrees + turns * 360;
    });
  }

  function selectUnit(nextUnit: Unit) {
    setUnit(nextUnit);
    rotateTo(nextUnit, nextUnit === "hour" ? currentHour : currentMinute);
  }

  function choose(next: number) {
    (hours ? setHour : setMinute)(pad(next));
    rotateTo(unit, next);
  }

  function choosePointer(event: React.PointerEvent<HTMLDivElement>) {
    const { left, top, width, height } =
      event.currentTarget.getBoundingClientRect();
    const x = event.clientX - left - width / 2;
    const y = event.clientY - top - height / 2;
    if (Math.hypot(x, y) < width * 0.08) return false;
    const fraction = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1;
    if (!hours) {
      choose(Math.round(fraction * 60) % 60);
      return true;
    }
    const index = Math.round(fraction * 12) % 12;
    const inside = !twelveHours && Math.hypot(x, y) < width * 0.3;
    choose(inside ? (index === 0 ? 0 : index + 12) : index || 12);
    return true;
  }

  function moveDial(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (key === "Home" || key === "End") {
      event.preventDefault();
      choose(key === "Home" ? dialMin : dialMax);
    } else if (
      ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].includes(key)
    ) {
      event.preventDefault();
      const step = key === "ArrowRight" || key === "ArrowUp" ? 1 : -1;
      const span = dialMax - dialMin + 1;
      choose(dialMin + ((selected - dialMin + step + span) % span));
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (hours) selectUnit("minute");
      else confirm.current?.click();
    }
  }

  return (
    <>
      <PickerTitle className="text-label-medium text-on-surface-variant">
        {typing ? "Enter time" : "Select time"}
      </PickerTitle>
      <div className="picker-time-fields">
        {(["hour", "minute"] as const).map((field) => {
          const isHour = field === "hour";
          const text = isHour ? hour : minute;
          const label = isHour ? "Hour" : "Minute";
          const invalid = !(isHour ? validHour : validMinute);
          return (
            <div
              key={field}
              className={cx("picker-time-field", !isHour && "col-start-3")}
            >
              {typing ? (
                <label className="grid min-w-0 gap-1">
                  <input
                    className="picker-time-number"
                    inputMode="numeric"
                    type="text"
                    autoFocus={isHour}
                    maxLength={2}
                    aria-invalid={invalid || undefined}
                    value={text}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (/^\d{0,2}$/.test(next))
                        (isHour ? setHour : setMinute)(next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirm.current?.click();
                      }
                    }}
                  />
                  <span className="text-body-small text-on-surface-variant">
                    {label}
                  </span>
                </label>
              ) : (
                <button
                  type="button"
                  className={cx("picker-time-number state-layer", focusRing)}
                  aria-label={`Select ${field}, ${isHour ? currentHour : currentMinute}`}
                  aria-pressed={unit === field}
                  onClick={() => selectUnit(field)}
                >
                  {pad(isHour ? currentHour : currentMinute)}
                </button>
              )}
            </div>
          );
        })}
        <span aria-hidden="true" className="picker-time-colon">
          :
        </span>
        {twelveHours && (
          <div role="group" aria-label="Period" className="picker-period">
            {[false, true].map((pm) => (
              <button
                key={String(pm)}
                type="button"
                aria-pressed={isPm === pm}
                className={cx("state-layer grid place-items-center", focusRing)}
                onClick={() => setPm(pm)}
              >
                {pm ? "PM" : "AM"}
              </button>
            ))}
          </div>
        )}
      </div>
      {!typing && (
        <div
          className={cx("picker-dial", focusRing)}
          role="slider"
          tabIndex={0}
          aria-label={hours ? "Hour dial" : "Minute dial"}
          aria-valuemin={dialMin}
          aria-valuemax={dialMax}
          aria-valuenow={selected}
          onKeyDown={moveDial}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.dataset.dragging = "";
              choosePointer(event);
            }
          }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            delete event.currentTarget.dataset.dragging;
            if (choosePointer(event) && hours) {
              setUnit("minute");
              rotateTo("minute", currentMinute);
            }
          }}
          onLostPointerCapture={(event) => {
            delete event.currentTarget.dataset.dragging;
          }}
        >
          <div
            className="picker-dial-hand"
            aria-hidden="true"
            data-inner={inner || undefined}
            style={{ rotate: `${angle}deg` }}
          >
            <span />
          </div>
          <span className="picker-dial-pivot" aria-hidden="true" />
          {ticks.map((index) => {
            const tick = hours ? index || 12 : index * 5;
            return (
              <span
                key={tick}
                className="picker-dial-tick"
                aria-hidden="true"
                data-selected={(!inner && tick === selected) || undefined}
                style={tickPosition(index, 40)}
              >
                {hours ? tick : pad(tick)}
              </span>
            );
          })}
          {hours &&
            !twelveHours &&
            ticks.map((index) => {
              const tick = index === 0 ? 0 : index + 12;
              return (
                <span
                  key={tick}
                  className="picker-dial-tick text-body-small"
                  aria-hidden="true"
                  data-selected={(inner && tick === selected) || undefined}
                  style={tickPosition(index, 23)}
                >
                  {pad(tick)}
                </span>
              );
            })}
          {!hours && selected % 5 !== 0 && (
            <span
              aria-hidden="true"
              className="picker-dial-dot"
              style={tickPosition(selected / 5, 40)}
            />
          )}
        </div>
      )}
      <PickerActions
        confirmRef={confirm}
        disabled={!valid}
        onClear={onClear}
        onConfirm={() => {
          const hour24 = twelveHours
            ? (currentHour % 12) + (isPm ? 12 : 0)
            : currentHour;
          onChange(`${pad(hour24)}:${pad(currentMinute)}`);
        }}
      >
        <IconButton
          icon={typing ? "schedule" : "keyboard"}
          label={typing ? "Use clock dial" : "Enter time with keyboard"}
          tooltip={false}
          onClick={() => {
            rotateTo(unit, selected);
            if (typing) {
              setHour(pad(currentHour));
              setMinute(pad(currentMinute));
            }
            setTyping(!typing);
          }}
        />
      </PickerActions>
    </>
  );
}
