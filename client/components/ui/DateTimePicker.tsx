import { Calendar, Clock } from "lucide-react";
import { forwardRef, useState, useEffect } from "react";

interface DateTimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  type?: "date" | "time" | "datetime-local";
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const DateTimePicker = forwardRef<HTMLInputElement, DateTimePickerProps>(
  (
    {
      value,
      onChange,
      type = "date",
      required = false,
      min,
      max,
      className = "",
      placeholder,
      disabled = false,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(value || "");
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
      if (value !== undefined) {
        setInternalValue(value);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      onChange?.(newValue);
    };

    const getIcon = () => {
      if (type === "time") {
        return <Clock className="h-5 w-5 text-gray-400 dark:text-gray-500" />;
      }
      return <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />;
    };

    const formatDisplayValue = () => {
      if (!internalValue) return "";

      try {
        if (type === "date") {
          const date = new Date(internalValue);
          return date.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          });
        } else if (type === "time") {
          return internalValue;
        } else if (type === "datetime-local") {
          const date = new Date(internalValue);
          return date.toLocaleString("es-AR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch {
        return internalValue;
      }

      return internalValue;
    };

    return (
      <div className="relative">
        {/* Icono */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          {getIcon()}
        </div>

        {/* Input nativo (oculto pero funcional) */}
        <input
          ref={ref}
          type={type}
          value={internalValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          required={required}
          min={min}
          max={max}
          disabled={disabled}
          className={`
            w-full h-14 pl-11 pr-4 py-2
            bg-white dark:bg-gray-800
            border-2 rounded-xl
            text-gray-900 dark:text-white
            transition-all duration-200
            cursor-pointer
            ${
              isFocused
                ? "border-sky-500 ring-4 ring-sky-500/10 dark:ring-sky-400/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }
            ${
              disabled
                ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                : ""
            }
            focus:outline-none
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            ${className}
          `}
          placeholder={placeholder}
          style={{
            colorScheme: "auto",
          }}
        />

        {/* Indicador de estado (opcional) */}
        {internalValue && !disabled && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
        )}
      </div>
    );
  }
);

DateTimePicker.displayName = "DateTimePicker";

// Componente wrapper para formularios no controlados (con name)
interface DateTimeInputProps {
  name?: string;
  type?: "date" | "time" | "datetime-local";
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  (
    {
      name,
      type = "date",
      value,
      defaultValue,
      onChange,
      required = false,
      min,
      max,
      className = "",
      placeholder,
      disabled = false,
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
      <input
        ref={ref}
        name={name}
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        className={`
          w-full h-14 pl-11 pr-4 py-2
          bg-white dark:bg-gray-800
          border-2 rounded-xl
          text-gray-900 dark:text-white
          transition-all duration-200
          cursor-pointer
          focus:outline-none
          placeholder:text-gray-400 dark:placeholder:text-gray-500
          ${
            isFocused
              ? "border-sky-500 ring-4 ring-sky-500/10 dark:ring-sky-400/20"
              : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
          }
          ${
            disabled
              ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
              : ""
          }
          ${className}
        `}
        placeholder={placeholder}
        style={{
          colorScheme: "auto",
        }}
      />
    );
  }
);

DateTimeInput.displayName = "DateTimeInput";
