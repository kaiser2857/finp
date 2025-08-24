import { Button, Flex, Space, Typography } from "antd";
import {
    BulbOutlined,
    CopyOutlined,
    DislikeFilled,
    DislikeOutlined,
    LikeFilled,
    LikeOutlined,
    ArrowRightOutlined,
} from "@ant-design/icons";
import { AnswerActionsProps } from "../types";
import TextArea from "antd/es/input/TextArea";
import { useTranslation } from "react-i18next";

const AnswerActions = ({
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
}: AnswerActionsProps) => {
    const { t } = useTranslation();
    return (
        <Flex vertical>
            <Flex
                align="center"
                justify="space-between"
                wrap="wrap"
                style={{ margin: "8px 0" }}
            >
                <Typography style={{ color: "#aaa", whiteSpace: "nowrap" }}>
                    以上内容由AI生成，仅供参考。
                </Typography>
                <Space style={{ color: "#eee", fontSize: "12px" }}>
                    <Button
                        size="small"
                        type="text"
                        disabled={
                            retrivalItem.answer.liked ||
                            retrivalItem.answer.disliked
                        }
                        icon={
                            retrivalItem.answer.liked ? (
                                <LikeFilled />
                            ) : (
                                <LikeOutlined />
                            )
                        }
                        onClick={onLike}
                    >
                        有用
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        disabled={
                            retrivalItem.answer.liked ||
                            retrivalItem.answer.disliked
                        }
                        icon={
                            retrivalItem.answer.disliked ? (
                                <DislikeFilled />
                            ) : (
                                <DislikeOutlined />
                            )
                        }
                        onClick={onDislike}
                    >
                        没用
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={onCopy}
                        disabled={index >= 2}
                    >
                        复制
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={onCopyImage}
                        disabled={index >= 2}
                    >
                        复制图像
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        icon={<BulbOutlined />}
                        onClick={onAskMore}
                        disabled={index >= 2}
                    >
                        追问
                    </Button>
                </Space>
            </Flex>
            {retrivalItem.answer.asking && (
                <Flex
                    vertical
                    style={{
                        border: "2px solid #d9d9d9",
                        borderRadius: "4px",
                    }}
                >
                    <TextArea
                        onChange={(e) => onAppendSearchChanged(e.target.value)}
                        onPressEnter={onAppendBoxPressEnter}
                        placeholder="继续提问"
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        size="large"
                        variant="borderless"
                        count={{ max: 1000 }}
                    />
                    <Flex
                        style={{
                            alignItems: "center",
                            justifyContent: "flex-end",
                            padding: "8px",
                        }}
                    >
                        <Button
                            shape="circle"
                            color="primary"
                            icon={<ArrowRightOutlined />}
                            onClick={onAppendSearch}
                        />
                    </Flex>
                </Flex>
            )}
        </Flex>
    );
};

export default AnswerActions;
