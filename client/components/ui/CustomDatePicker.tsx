import { forwardRef, useState, useEffect } from "react";
import ReactDatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import "react-datepicker/dist/react-datepicker.css";
import { Calendar, Clock, X } from "lucide-react";

registerLocale("es", es);

interface CustomDatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  type?: "date" | "time" | "datetime";
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  showTimeSelect?: boolean;
  showTimeSelectOnly?: boolean;
  timeIntervals?: number;
  dateFormat?: string;
}

export const CustomDatePicker = forwardRef<HTMLDivElement, CustomDatePickerProps>(
  (
    {
      value,
      onChange,
      type = "date",
      placeholder = "Selecciona fecha",
      required = false,
      disabled = false,
      minDate,
      maxDate,
      className = "",
      timeIntervals = 15,
    },
    ref
  ) => {
    const [selectedDate, setSelectedDate] = useState<Date | null>(value || null);
    const [isFocused, setIsFocused] = useState(false);

    const handleChange = (date: Date | null) => {
      setSelectedDate(date);
      onChange?.(date);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleChange(null);
    };

    const getDateFormat = () => {
      if (type === "time") return "HH:mm";
      if (type === "datetime") return "dd/MM/yyyy HH:mm";
      return "dd/MM/yyyy";
    };

    const getIcon = () => {
      if (type === "time") {
        return <Clock className="h-5 w-5" />;
      }
      return <Calendar className="h-5 w-5" />;
    };

    const showTime = type === "time" || type === "datetime";
    const showTimeOnly = type === "time";

    return (
      <div ref={ref} className="relative">
        <div
          className={`
            relative flex items-center
            w-full h-12 px-4
            bg-white dark:bg-gray-800
            border-2 rounded-xl
            transition-all duration-200
            ${
              isFocused
                ? "border-sky-500 ring-4 ring-sky-500/10 dark:ring-sky-400/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }
            ${
              disabled
                ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                : "cursor-pointer"
            }
            ${className}
          `}
        >
          {/* Icono */}
          <div className="mr-3 text-gray-400 dark:text-gray-500">
            {getIcon()}
          </div>

          {/* DatePicker */}
          <ReactDatePicker
            selected={selectedDate}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            showTimeSelect={showTime}
            showTimeSelectOnly={showTimeOnly}
            timeIntervals={timeIntervals}
            dateFormat={getDateFormat()}
            placeholderText={placeholder}
            disabled={disabled}
            minDate={minDate}
            maxDate={maxDate}
            locale="es"
            timeCaption="Hora"
            required={required}
            className="flex-1 bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 w-full"
            calendarClassName="custom-datepicker-calendar"
            popperClassName="custom-datepicker-popper"
            wrapperClassName="flex-1"
          />

          {/* Botón de limpiar */}
          {selectedDate && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

CustomDatePicker.displayName = "CustomDatePicker";

// Componente para formularios con name
interface CustomDateInputProps extends Omit<CustomDatePickerProps, "value" | "onChange"> {
  name: string;
  defaultValue?: string;
  onDateChange?: (date: Date | null, name: string) => void;
}

export const CustomDateInput = forwardRef<HTMLDivElement, CustomDateInputProps>(
  ({ name, defaultValue, onDateChange, ...props }, ref) => {
    // Parse defaultValue only once on mount, then track internally
    const [date, setDate] = useState<Date | null>(() => {
      if (defaultValue) {
        const parsed = new Date(defaultValue);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    });

    // Track if we've initialized to avoid re-syncing on every render
    const [hasInitialized, setHasInitialized] = useState(false);

    // Only sync from defaultValue on initial load or if defaultValue changes significantly
    useEffect(() => {
      if (!hasInitialized && defaultValue) {
        const newDate = new Date(defaultValue);
        if (!isNaN(newDate.getTime())) {
          setDate(newDate);
          setHasInitialized(true);
        }
      }
    }, [defaultValue, hasInitialized]);

    const handleChange = (newDate: Date | null) => {
      console.log('[CustomDateInput] handleChange called:', name, newDate?.toISOString());
      setDate(newDate);
      if (onDateChange) {
        onDateChange(newDate, name);
      }
    };

    return (
      <>
        <CustomDatePicker
          ref={ref}
          value={date}
          onChange={handleChange}
          {...props}
        />
        {/* Hidden input para enviar el valor en el formulario */}
        <input
          type="hidden"
          name={name}
          value={date ? date.toISOString() : ""}
        />
      </>
    );
  }
);

CustomDateInput.displayName = "CustomDateInput";
