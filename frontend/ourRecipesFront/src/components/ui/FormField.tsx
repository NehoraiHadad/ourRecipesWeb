import { useId } from 'react'
import { useFormContext } from 'react-hook-form'
import { Input, InputProps } from './Input'

interface FormFieldProps extends Omit<InputProps, 'name'> {
  name: string
  rules?: {
    required?: boolean | string
    minLength?: number | { value: number; message: string }
    maxLength?: number | { value: number; message: string }
    pattern?: RegExp | { value: RegExp; message: string }
    validate?: (value: any) => boolean | string | Promise<boolean | string>
  }
}

export function FormField({ name, rules, ...props }: FormFieldProps) {
  const id = useId()
  const { register, formState: { errors } } = useFormContext()
  const error = errors[name]?.message as string

  return (
    <Input
      id={id}
      error={error}
      {...register(name, {
        required: rules?.required && {
          value: true,
          message: typeof rules.required === 'string' 
            ? rules.required 
            : 'שדה חובה'
        },
        minLength: rules?.minLength && {
          value: typeof rules.minLength === 'number' 
            ? rules.minLength 
            : rules.minLength.value,
          message: typeof rules.minLength === 'number'
            ? `מינימום ${rules.minLength} תווים`
            : rules.minLength.message
        },
        maxLength: rules?.maxLength && {
          value: typeof rules.maxLength === 'number'
            ? rules.maxLength
            : rules.maxLength.value,
          message: typeof rules.maxLength === 'number'
            ? `מקסימום ${rules.maxLength} תווים`
            : rules.maxLength.message
        },
        pattern: rules?.pattern && {
          value: rules.pattern instanceof RegExp
            ? rules.pattern
            : rules.pattern.value,
          message: rules.pattern instanceof RegExp
            ? 'ערך לא תקין'
            : rules.pattern.message
        },
        validate: rules?.validate
      })}
      {...props}
    />
  )
} 