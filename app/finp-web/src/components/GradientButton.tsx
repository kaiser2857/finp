import { useContext } from "react";
import { Button, ConfigProvider, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { css } from "@emotion/css";
import { useTranslation } from "react-i18next";

interface IProps {
  onClick: () => void;
  style?: React.CSSProperties;
  size?: "small" | "middle" | "large";
  height?: number;
}
const GradientButton = (props: IProps) => {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  const { t } = useTranslation();
  const rootPrefixCls = getPrefixCls();
  const linearGradientButton = css`
        &.${rootPrefixCls}-btn-primary:not([disabled]):not(
                .${rootPrefixCls}-btn-dangerous
            ) {
            border-width: 0;
            background: linear-gradient(135deg, #64748b 0%, #475569 100%);
            font-weight: 500;

            > span {
                position: relative;
            }

            &:hover {
                background: linear-gradient(135deg, #475569 0%, #334155 100%);
            }
        }
    `;
  return (
    <ConfigProvider
      button={{
        className: linearGradientButton,
      }}
    >
      <Space>
        <Button
          type="primary"
          size={props.size || "large"}
          icon={<SearchOutlined />}
          onClick={props.onClick}
          style={{
            height: props.height || 40,
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...props.style
          }}
        >
          搜索
        </Button>
      </Space>
    </ConfigProvider>
  );
};

export default GradientButton;
