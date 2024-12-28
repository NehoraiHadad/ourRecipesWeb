import { HTMLAttributes } from 'react'
import { UseFormReturn, FormProvider } from 'react-hook-form'
import { cn } from '@/utils/cn'

interface FormProps extends Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  form: UseFormReturn<any>
  onSubmit: (data: any) => void | Promise<void>
}

export function Form({
  form,
  onSubmit,
  children,
  className,
  ...props
}: FormProps) {
  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('space-y-6', className)}
        {...props}
      >
        {children}
      </form>
    </FormProvider>
  )
}

// Form Section component for grouping form fields
interface FormSectionProps extends HTMLAttributes<HTMLDivElement> {}

export function FormSection({
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <div 
      className={cn('space-y-4', className)}
      {...props}
    >
      {children}
    </div>
  )
} 