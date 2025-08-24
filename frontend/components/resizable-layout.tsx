"use client"

import type React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Menu, MessageSquare, Minimize2 } from "lucide-react"

interface ResizableLayoutProps {
  leftPanel: React.ReactNode
  centerPanel: React.ReactNode
  rightPanel: React.ReactNode
  leftMinWidth?: number
  leftMaxWidth?: number
  rightMinWidth?: number
  rightMaxWidth?: number
  leftDefaultWidth?: number
  rightDefaultWidth?: number
  showRightPanel?: boolean
  onRightPanelAction?: () => void // 新增：直接接收右侧面板操作函数
}

export default function ResizableLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftMinWidth = 50,
  leftMaxWidth = 250,
  rightMinWidth = 50,
  rightMaxWidth = 9999,
  leftDefaultWidth = 256,
  rightDefaultWidth = 384,
  showRightPanel = false,
  onRightPanelAction, // 新增参数
}: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(leftDefaultWidth)
  const [rightWidth, setRightWidth] = useState(rightDefaultWidth)
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [centerCollapsed, setCenterCollapsed] = useState(false)

  // 新增：全屏状态管理
  const [isRightPanelFullscreen, setIsRightPanelFullscreen] = useState(false)
  const [preFullscreenState, setPreFullscreenState] = useState<{
    leftWidth: number
    rightWidth: number
    centerCollapsed: boolean
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const leftResizeRef = useRef<HTMLDivElement>(null)
  const rightResizeRef = useRef<HTMLDivElement>(null)

  const SNAP_THRESHOLD = 80 // 吸附阈值

  // 实际显示的左侧宽度（如果宽度为0则隐藏面板）
  const actualLeftWidth = leftWidth === 0 ? 0 : leftWidth
  const actualShowLeftPanel = leftWidth > 0

  // 实际显示的右侧宽度（如果宽度为0则隐藏面板）
  // 修复：当 showRightPanel 为 false 时，应视为右侧宽度为 0，这样中间面板可以使用全部宽度
  const actualRightWidth = showRightPanel && rightWidth > 0 ? rightWidth : 0
  const actualShowRightPanel = showRightPanel && rightWidth > 0

  // 计算中间面板的宽度 - 考虑折叠状态
  const centerWidth = centerCollapsed ? "0px" : `calc(100% - ${actualLeftWidth}px - ${actualRightWidth}px)`

  // 动态计算右侧面板的实际最大宽度
  const getDynamicRightMaxWidth = useCallback(() => {
    if (!containerRef.current) return rightMaxWidth
    const containerTotalWidth = containerRef.current.getBoundingClientRect().width
    // 右侧面板最大可以占据除了左侧面板最小宽度之外的所有空间
    return Math.max(rightMinWidth, containerTotalWidth - leftMinWidth)
  }, [rightMaxWidth, rightMinWidth, leftMinWidth])

  // 左侧分隔线拖拽处理
  const handleLeftMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingLeft(true)
  }, [])

  // 右侧分隔线拖拽处理
  const handleRightMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingRight(true)
  }, [])

  // 鼠标移动处理 - 改进吸附逻辑
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - containerRect.left

      if (isResizingLeft) {
        // 左侧面板拖拽逻辑 - 改进吸附
        const rawLeftWidth = mouseX

        if (rawLeftWidth <= SNAP_THRESHOLD) {
          // 在吸附阈值内，直接吸附到0
          setLeftWidth(0)
        } else {
          // 正常拖拽，但限制在合理范围内
          const newLeftWidth = Math.max(leftMinWidth, Math.min(leftMaxWidth, rawLeftWidth))
          setLeftWidth(newLeftWidth)
        }
      }

      if (isResizingRight && showRightPanel) {
        const containerTotalWidth = containerRect.width
        const availableWidth = containerTotalWidth - actualLeftWidth
        const dynamicRightMaxWidth = getDynamicRightMaxWidth()
        const rawRightWidth = containerTotalWidth - mouseX

        // 右侧面板向右拖拽吸附到0的逻辑
        if (rawRightWidth <= SNAP_THRESHOLD) {
          setRightWidth(0)
          setCenterCollapsed(false)
          return
        }

        const newRightWidth = Math.max(rightMinWidth, Math.min(dynamicRightMaxWidth, rawRightWidth))

        // 右侧面板向左拖拽挤压中间容器的逻辑（保持原有逻辑）
        const criticalThreshold = availableWidth * 0.75

        if (newRightWidth >= criticalThreshold) {
          // 右侧面板超过临界值，中间容器折叠，右侧占据所有可用空间
          setRightWidth(availableWidth)
          setCenterCollapsed(true)
        } else {
          // 右侧面板未超过临界值，正常显示
          setRightWidth(newRightWidth)
          setCenterCollapsed(false)
        }
      }
    },
    [
      isResizingLeft,
      isResizingRight,
      leftMinWidth,
      leftMaxWidth,
      rightMinWidth,
      showRightPanel,
      actualLeftWidth,
      getDynamicRightMaxWidth,
      SNAP_THRESHOLD,
    ],
  )

  // 鼠标释放处理 - 简化逻辑，因为吸附已在拖拽过程中处理
  const handleMouseUp = useCallback(() => {
    setIsResizingLeft(false)
    setIsResizingRight(false)
  }, [])

  // 添加全局鼠标事件监听
  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
  }, [isResizingLeft, isResizingRight, handleMouseMove, handleMouseUp])

  // 当拖拽状态结束时，确保清理全局样式
  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizingLeft, isResizingRight])

  // 显示左侧面板
  const handleShowLeftPanel = useCallback(() => {
    setLeftWidth(leftDefaultWidth)
  }, [leftDefaultWidth])

  // 显示右侧面板（当右侧面板被拖拽到0时使用）
  const handleShowRightPanel = useCallback(() => {
    setRightWidth(rightDefaultWidth)
    setCenterCollapsed(false)
  }, [rightDefaultWidth])

  // 真正的全屏右侧面板
  const handleFullscreenRightPanel = useCallback(() => {
    if (!containerRef.current) return

    if (isRightPanelFullscreen) {
      // 退出全屏，恢复之前的状态
      if (preFullscreenState) {
        setLeftWidth(preFullscreenState.leftWidth)
        setRightWidth(preFullscreenState.rightWidth)
        setCenterCollapsed(preFullscreenState.centerCollapsed)
      }
      setIsRightPanelFullscreen(false)
      setPreFullscreenState(null)
    } else {
      // 进入全屏
      // 保存当前状态
      setPreFullscreenState({
        leftWidth,
        rightWidth,
        centerCollapsed,
      })

      // 设置全屏状态
      const containerTotalWidth = containerRef.current.getBoundingClientRect().width
      setLeftWidth(0) // 完全隐藏左侧面板
      setRightWidth(containerTotalWidth) // 右侧面板占据整个宽度
      setCenterCollapsed(true) // 折叠中间容器
      setIsRightPanelFullscreen(true)
    }
  }, [isRightPanelFullscreen, preFullscreenState, leftWidth, rightWidth, centerCollapsed])

  // 获取Chat按钮属性 - 修改：仅当提供 onRightPanelAction 时在未显示右侧面板时显示按钮
  const getChatButtonProps = () => {
    const rightPanelCollapsed = showRightPanel && rightWidth === 0

    if (!showRightPanel) {
      return {
        title: "打开AI助手",
        show: Boolean(onRightPanelAction),
        onClick: onRightPanelAction || (() => {}),
      }
    } else if (rightPanelCollapsed) {
      return {
        title: "恢复AI助手",
        show: true,
        onClick: handleShowRightPanel,
      }
    } else {
      return {
        title: "",
        show: false,
        onClick: () => {},
      }
    }
  }

  const chatButtonProps = getChatButtonProps()

  return (
    <div ref={containerRef} className="flex h-screen bg-gray-50 overflow-hidden relative">
      {/* 左侧面板 */}
      {actualShowLeftPanel && (
        <div
          className="bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden"
          style={{ width: actualLeftWidth }}
        >
          <div className="h-full overflow-y-auto">{leftPanel}</div>
        </div>
      )}

      {/* 左侧分隔线 - 只在左侧面板显示时显示 */}
      {actualShowLeftPanel && (
        <div
          ref={leftResizeRef}
          className={`w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors ${
            isResizingLeft ? "bg-blue-400" : ""
          }`}
          onMouseDown={handleLeftMouseDown}
          title={`拖拽调整宽度 (${leftMinWidth}px - ${leftMaxWidth}px)，向左拖拽到${SNAP_THRESHOLD}px以下时自动吸附到0`}
        />
      )}

      {/* 左侧面板唤出按钮 - 只在左侧面板隐藏且不在全屏模式时显示 */}
      {!actualShowLeftPanel && !isRightPanelFullscreen && (
        <div className="absolute top-4 left-4 z-50">
          <Button
            onClick={handleShowLeftPanel}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg transition-all duration-200 hover:scale-105"
            size="icon"
            title="显示左侧面板"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* 中间面板 - 直接渲染，不传递props */}
      <div
        className={`flex-1 overflow-hidden relative transition-all duration-300 ${
          centerCollapsed ? "opacity-0" : "opacity-100"
        }`}
        style={{ width: centerWidth }}
      >
        {!centerCollapsed && (
          <div className="h-full overflow-hidden">
            {/* 内部容器占满高度，避免嵌套滚动条 */}
            <div style={{ height: "100%" }}>
              {centerPanel}
            </div>
          </div>
        )}

        {/* 统一的AI Chat按钮 - 在ResizableLayout层级处理 */}
        {chatButtonProps.show && !centerCollapsed && (
          <div className="absolute top-1/2 right-6 transform -translate-y-1/2 z-40">
            <Button
              onClick={chatButtonProps.onClick}
              className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg"
              size="icon"
              title={chatButtonProps.title}
            >
              <MessageSquare className="w-6 h-6" />
            </Button>
          </div>
        )}
      </div>

      {/* 右侧分隔线 - 只在右侧面板显示且宽度大于0且不在全屏模式时显示 */}
      {actualShowRightPanel && !isRightPanelFullscreen && (
        <div
          ref={rightResizeRef}
          className={`w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors ${
            isResizingRight ? "bg-blue-400" : ""
          } ${centerCollapsed ? "bg-orange-400" : ""}`}
          onMouseDown={handleRightMouseDown}
          title={
            centerCollapsed
              ? `中间容器已折叠，向右拖拽恢复 (临界值: 75%) 或向右拖拽到${SNAP_THRESHOLD}px以下自动吸附到0`
              : `向左拖拽超过75%临界值时中间容器将折叠，向右拖拽到${SNAP_THRESHOLD}px以下时自动吸附到0`
          }
        />
      )}

      {/* 右侧面板 */}
      {actualShowRightPanel && (
        <div
          className="bg-white border-l border-gray-200 flex-shrink-0 overflow-hidden relative"
          style={{ width: rightWidth }}
        >
          <div className="h-full overflow-y-auto">{rightPanel}</div>

          {/* 全屏/退出全屏按钮 */}
          <div className="absolute top-4 right-4 z-10">
            <Button
              onClick={handleFullscreenRightPanel}
              variant="ghost"
              size="sm"
              className="text-xs bg-white/80 hover:bg白色 shadow-sm flex items-center gap-1"
              title={isRightPanelFullscreen ? "退出全屏" : "全屏显示AI助手"}
            >
              {isRightPanelFullscreen ? (
                <>
                  <Minimize2 className="w-3 h-3" />
                  退出全屏
                </>
              ) : (
                "全屏"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
