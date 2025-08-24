import { Button } from "antd";
import { ExpandAltOutlined, FileSearchOutlined } from "@ant-design/icons";
import { SearchResultsProps } from "../types";
import HitList from "../../../components/HitList";
import { useTranslation } from "react-i18next";

const SearchResults = ({
  retrivalItem,
  onShowFullAnswer,
  retrivals,
  refreshUI,
}: SearchResultsProps) => {
  const { t } = useTranslation();
  return (
    <div style={{
      background: "#ffffff",
      borderRadius: "12px",
      border: "1px solid #e2e8f0",
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
        borderBottom: "1px solid #e2e8f0"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#475569",
          fontSize: "14px",
          fontWeight: "600"
        }}>
          <FileSearchOutlined style={{ fontSize: "16px" }} />
          <span>搜索结果</span>
        </div>

        {retrivals.length > 1 && (
          <Button
            icon={<ExpandAltOutlined />}
            size="small"
            type="text"
            onClick={() => {
              retrivalItem.search.collapsed =
                !retrivalItem.search.collapsed;
              refreshUI();
            }}
            style={{
              color: "#64748b",
              borderRadius: "6px",
              height: "28px",
              fontSize: "12px"
            }}
          >
            {retrivalItem.search.collapsed
              ? "[展开]"
              : "[收起]"}
          </Button>
        )}
      </div>

      {!retrivalItem.search.collapsed && (
        <div style={{ padding: "20px 24px" }}>
          <HitList
            loading={retrivalItem.search.loading}
            list={retrivalItem.search.results}
            onShowFullAnswer={onShowFullAnswer}
          />
        </div>
      )}
    </div>
  );
};

export default SearchResults;
