import Title from "antd/es/typography/Title";
import { SearchHeaderProps } from "../types";
import { useTranslation } from "react-i18next";
import { TextResourcesKey } from "../../../types/Base";

const SearchHeader = ({ onGoHome }: SearchHeaderProps) => {
  const { t } = useTranslation();
  return (
    <div style={{
      background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
      borderBottom: "1px solid #e2e8f0",
      padding: "16px 24px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)"
    }}>
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto",
        display: "flex",
        alignItems: "center"
      }}>
        <a
          onClick={onGoHome}
          style={{
            textDecoration: "none",
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Title
            level={2}
            style={{
              background: "linear-gradient(135deg, #6f707aff 0%, #aba9b1ff 50%, #5c5a5bff 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              margin: 0,
              fontSize: "28px",
              fontWeight: "700",
              letterSpacing: "-0.02em"
            }}
          >
            智能投研平台ai搜索
          </Title>
        </a>
      </div>
    </div>
  );
};

export default SearchHeader;
