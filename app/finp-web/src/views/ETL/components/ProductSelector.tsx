import React from "react";
import { Select, Button, Upload, message, Space } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";

interface ProductSelectorProps {
  products: string[];
  product: string;
  setProduct: (p: string) => void;
  onNewProduct: () => void;
  onUpload: (file: File) => Promise<void>;
}

const ProductSelector: React.FC<ProductSelectorProps> = ({
  products,
  product,
  setProduct,
  onNewProduct,
  onUpload,
}) => (
  <Space wrap size={8} align="center">
    <span style={{ color: '#475569', fontWeight: 600 }}>选择知识库：</span>
    <Select
      style={{ width: 220 }}
      value={product}
      onChange={setProduct}
      options={products.map((p) => ({ label: p, value: p }))}
    />
    <Button
      icon={<PlusOutlined />}
      onClick={onNewProduct}
      style={{ borderRadius: 8 }}
    >
      新建知识库
    </Button>
    <Upload
      multiple
      showUploadList={false}
      customRequest={async ({ file, onSuccess, onError }) => {
        try {
          await onUpload(file as File);
          if (onSuccess) onSuccess({}, file);
        } catch (e) {
          message.error("上传失败");
          if (onError) onError(e as any);
        }
      }}
    >
      <Button
        type="primary"
        icon={<UploadOutlined />}
        style={{
          borderRadius: 8,
          background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
          border: 'none',
          boxShadow: '0 2px 8px rgba(100,116,139,0.2)'
        }}
      >
        上传文件
      </Button>
    </Upload>
  </Space>
);

export default ProductSelector;
