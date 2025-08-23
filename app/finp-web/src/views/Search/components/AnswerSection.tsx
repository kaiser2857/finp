import { Button } from "antd";
import { HighlightOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { AnswerSectionProps } from "../types";
import { SearchMode } from "../../../types/Base";
import { Markdown } from "../../../components/Markdown";
import AnswerActions from "./AnswerActions";
import Title from "antd/es/typography/Title";
import { useTranslation } from "react-i18next";

const AnswerSection = ({
  retrivalItem,
  index,
  onLike,
  onDislike,
  onCopy,
  onCopyImage,
  onAskMore,
  onAppendSearch,
  onAppendSearchChanged,
  onAppendBoxPressEnter,
  onPause,
  searchMode,
}: AnswerSectionProps) => {
  const { t } = useTranslation();
  return (
    <div
      id={"ais-answer-" + index}
      style={{
        padding: "24px 28px",
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        margin: "0 0 20px 0",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)"
      }}
    >
      {index > 0 && (
        <div style={{
          marginBottom: "20px",
          padding: "16px 20px",
          background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
          borderRadius: "8px",
          border: "1px solid #e2e8f0"
        }}>
          <Title level={3} style={{ margin: 0, color: "#1e293b" }}>
            {retrivalItem.query}
          </Title>
        </div>
      )}

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "20px"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#64748b",
          fontSize: "14px",
          fontWeight: "600"
        }}>
          <HighlightOutlined style={{ fontSize: "16px" }} />
          <span>
            {searchMode === SearchMode.Think
              ? t("Answer.DeepThink")
              : t("Answer.SmartAnswer")}
          </span>
        </div>

        {retrivalItem.answer.typing && (
          <Button
            icon={<PauseCircleOutlined />}
            onClick={onPause}
            type="primary"
            danger
            size="small"
            style={{
              borderRadius: "6px",
              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.2)"
            }}
          >
            {t("Answer.StopGenerating")}
          </Button>
        )}
      </div>

      {retrivalItem.answer.reasoning_content && (
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
          border: "1px solid #fbbf24",
          borderRadius: "8px",
          marginBottom: "16px"
        }}>
          <div style={{
            color: "#92400e",
            fontSize: "14px",
            lineHeight: "1.6"
          }}>
            {retrivalItem.answer.reasoning_content}
          </div>
        </div>
      )}

      <div style={{
        padding: "20px 24px",
        background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        marginBottom: "20px"
      }}>
        <Markdown
          content={retrivalItem.answer.content}
          loading={retrivalItem.answer.loading}
        />
      </div>

      {!retrivalItem.answer.typing && (
        <AnswerActions
          retrivalItem={retrivalItem}
          index={index}
          onLike={onLike}
          onDislike={onDislike}
          onCopy={onCopy}
          onCopyImage={onCopyImage}
          onAskMore={onAskMore}
          onAppendSearch={onAppendSearch}
          onAppendSearchChanged={onAppendSearchChanged}
          onAppendBoxPressEnter={onAppendBoxPressEnter}
        />
      )}
    </div>
  );
};

export default AnswerSection;
