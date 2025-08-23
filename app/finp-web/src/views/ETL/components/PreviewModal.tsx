import React from "react";
import { Modal } from "antd";

interface PreviewModalProps {
  open: boolean;
  title: string;
  content: any;
  onCancel: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  open,
  title,
  content,
  onCancel,
}) => (
  <Modal
    open={open}
    title={title}
    onCancel={onCancel}
    footer={null}
    width={860}
  >
    <div
      style={{
        maxHeight: 500,
        overflow: "auto",
        borderRadius: 8,
        padding: 12,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
      }}
    >
      {content ? JSON.stringify(content, null, 2) : ""}
    </div>
  </Modal>
);

export default PreviewModal;
