"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { AlertCircle, CheckCircle2, Info } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isDestructive = (props as any)?.variant === "destructive"
        const Icon = isDestructive ? AlertCircle : title || description ? Info : CheckCircle2
        const showTitle = title || (isDestructive ? "操作失败" : "通知")
        const showDescription = description || (isDestructive ? "请重试或查看详细错误信息。" : undefined)
        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-3">
              <Icon className={`h-4 w-4 mt-0.5 ${isDestructive ? "text-red-600 dark:text-red-300" : "text-muted-foreground"}`} />
              <div className="grid gap-1">
                {showTitle && <ToastTitle>{showTitle}</ToastTitle>}
                {showDescription && (
                  <ToastDescription>{showDescription}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
