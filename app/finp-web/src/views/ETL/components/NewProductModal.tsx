import React from "react";
import { Modal, Input, Typography } from "antd";

const { Text } = Typography;

interface NewProductModalProps {
  open: boolean;
  newProductName: string;
  setNewProductName: (v: string) => void;
  onCancel: () => void;
  onOk: () => void;
}

const NewProductModal: React.FC<NewProductModalProps> = ({
  open,
  newProductName,
  setNewProductName,
  onCancel,
  onOk,
}) => (
  <Modal open={open} title="新建知识库" onCancel={onCancel} onOk={onOk} okButtonProps={{ style: { background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', border: 'none' } }}>
    <Text type="secondary">知识库名称仅支持字母、数字、下划线，建议英文</Text>
    <Input
      placeholder="输入新知识库名称"
      value={newProductName}
      onChange={(e) => setNewProductName(e.target.value)}
      style={{ marginTop: 8 }}
    />
  </Modal>
);

export default NewProductModal;
