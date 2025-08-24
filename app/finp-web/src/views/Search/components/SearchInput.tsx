import { Input, Select, Button, Dropdown, Spin } from "antd";
import { isMobile } from "react-device-detect";
import { SearchInputProps } from "../types";
import {
  SearchMode,
} from "../../../types/Base";
import { RobotOutlined, RocketOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const { TextArea } = Input;

const searchModeIcons = {
  [SearchMode.Chat]: <RobotOutlined />,
  [SearchMode.Think]: <RocketOutlined />,
};

const SearchInput = ({
  products,
  productsLoading,
  selectedProduct,
  searchMode,
  inputValue,
  onProductChange,
  onInputChange,
  onSearch,
  searchModeItems,
}: SearchInputProps) => {
  const { t } = useTranslation();
  return (
    <div style={{
      width: "100%",
      padding: "24px 16px 20px 16px",
      background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
      borderBottom: "1px solid #e2e8f0",
      boxSizing: "border-box",
    }}>
      {/* 产品选择区域 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "20px"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <span style={{
            fontSize: "14px",
            color: "#64748b",
            fontWeight: "500"
          }}>
            知识库:
          </span>
          {productsLoading ? (
            <Spin size="small" />
          ) : (
            <Select
              value={selectedProduct}
              onChange={onProductChange}
              style={{
                width: 150,
                borderRadius: "8px"
              }}
              placeholder="选择知识库"
              options={[
                { label: "通用", value: "generic" },
                ...products.map((product) => ({
                  label: t(product.display_name, { defaultValue: product.name }),
                  value: product.id,
                }))
              ]}
            />
          )}
        </div>
      </div>

      {/* 搜索输入区域 */}
      <div style={{
        display: "flex",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex",
          position: "relative",
          borderRadius: "16px",
          background: "#ffffff",
          border: "2px solid #e2e8f0",
          transition: "all 0.3s ease",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.06)",
          minHeight: "48px",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}>
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            width: "100%",
            maxWidth: "100%",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* 搜索模式选择器 */}
            <Dropdown menu={{ items: searchModeItems }}>
              <Button
                type="text"
                icon={searchModeIcons[searchMode]}
                style={{
                  border: "none",
                  background: "none",
                  color: "#64748b",
                  fontSize: "16px",
                  height: "48px",
                  padding: "0 12px",
                  borderRight: "1px solid #e2e8f0",
                  borderRadius: "0",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexShrink: 0, // 防止收缩
                }}
              >
                {!isMobile && (
                  <span style={{
                    fontSize: "13px",
                    fontWeight: "500",
                    whiteSpace: "nowrap" // 防止文字换行
                  }}>
                    {searchMode === SearchMode.Chat ? "问答模式" : "思考模式"}
                  </span>
                )}
              </Button>
            </Dropdown>

            {/* 多行输入框 */}
            <TextArea
              value={inputValue}
              placeholder="输入你想了解的问题"
              onChange={onInputChange}
              bordered={false}
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{
                fontSize: "16px",
                background: "transparent",
                resize: "none",
                padding: "12px 16px 12px 16px",
                paddingRight: "48px", // 为搜索按钮留出空间
                lineHeight: "1.5",
                flex: 1,
                minWidth: 0, // 允许收缩
                maxWidth: "100%",
                boxSizing: "border-box",
                wordWrap: "break-word",
                wordBreak: "break-word",
              }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  onSearch();
                }
              }}
            />

            {/* 搜索按钮 - 位于输入框内部右下角 */}
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={onSearch}
              style={{
                position: "absolute",
                right: "8px",
                bottom: "8px",
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                background: "transparent",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f1f5f9";
                e.currentTarget.style.color = "#475569";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#64748b";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchInput;
