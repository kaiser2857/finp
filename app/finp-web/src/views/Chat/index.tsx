import {
  Avatar,
  Button,
  Input,
  Select,
  Space,
  Tooltip,
  Badge,
  Empty,
  List,
  Upload,
  Dropdown,
} from "antd";
import {
  FileSearchOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  DatabaseOutlined,
  MessageOutlined,
  UserOutlined,
  BulbOutlined,
  CloseOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PaperClipOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  DownOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import Title from "antd/es/typography/Title";
import HitList from "../../components/HitList";
import { useRef, useState, useEffect } from "react";
import { getChatResult, getSearchResult } from "../../services/ApiService";
import { Markdown } from "../../components/Markdown";
import { MessageItem } from "../../types/Api";
import "./index.css";
import CustomFooter from "../../components/CustomFooter";
import { useProducts } from "../../hooks/useProducts";
import { useTranslation } from "react-i18next";

interface ChatSession {
  id: string;
  title: string;
  messages: MessageItem[];
  createdAt: Date;
}

const ChatPage = () => {
  const { TextArea } = Input;
  const { t } = useTranslation();

  // 使用与Search页面相同的产品/知识库管理逻辑
  const { products, loading: productsLoading, selectedProduct, selectProduct } = useProducts();

  const keywordRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [_, setKeyword] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([] as MessageItem[]);
  const [__, setController] = useState<AbortController>();

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchList, setSearchList] = useState([]);

  // 历史对话相关状态
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // 侧边栏收缩状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // 新增输入框功能状态
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(false);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 当消息更新时自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages, answer]);

  // 加载历史对话
  useEffect(() => {
    const savedSessions = localStorage.getItem('chat-sessions');
    if (savedSessions) {
      const sessions = JSON.parse(savedSessions).map((session: any) => ({
        ...session,
        createdAt: new Date(session.createdAt)
      }));
      setChatSessions(sessions);
    }
  }, []);

  // 保存对话到localStorage
  const saveSessions = (sessions: ChatSession[]) => {
    localStorage.setItem('chat-sessions', JSON.stringify(sessions));
    setChatSessions(sessions);
  };

  // 模型选择项
  const modelOptions = [
    {
      key: 'gpt-4o',
      label: (
        <div className="model-option">
          <div className="model-name">GPT-4o</div>
          <div className="model-desc">最新的GPT-4优化版本</div>
        </div>
      ),
      value: 'gpt-4o'
    },
    {
      key: 'gpt-4',
      label: (
        <div className="model-option">
          <div className="model-name">GPT-4</div>
          <div className="model-desc">强大的多模态模型</div>
        </div>
      ),
      value: 'gpt-4'
    },
    {
      key: 'claude-3',
      label: (
        <div className="model-option">
          <div className="model-name">Claude-3</div>
          <div className="model-desc">Anthropic最新模型</div>
        </div>
      ),
      value: 'claude-3'
    },
    {
      key: 'gpt-3.5-turbo',
      label: (
        <div className="model-option">
          <div className="model-name">GPT-3.5 Turbo</div>
          <div className="model-desc">快速响应的轻量模型</div>
        </div>
      ),
      value: 'gpt-3.5-turbo'
    }
  ];

  // 处理模型选择
  const handleModelSelect = ({ key }: { key: string }) => {
    setSelectedModel(key);
  };

  // 处理文件上传
  const handleFileUpload = (file: any) => {
    console.log('文件上传:', file);
    // 这里添加文件上传逻辑
    return false;
  };

  const generateSessionTitle = (messages: any[]) => {
    if (messages.length === 0) return '新对话';
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage && firstUserMessage.content) {
      return firstUserMessage.content.length > 30
        ? firstUserMessage.content.substring(0, 30) + '...'
        : firstUserMessage.content;
    }
    return '新对话';
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const createSearchResult = (query: string) => {
    if (query === "") {
      setSearchLoading(false);
      setSearchList([]);
    } else {
      setSearchLoading(true);
      getSearchResult(query, "chat", selectedProduct, "", 0).then(
        (res) => {
          setSearchLoading(false);
          setSearchList(res);
        }
      );
    }
  };

  const handleNewChat = () => {
    setInputValue("");
    setKeyword("");
    setAnswer("");
    setMessages([]);
    setCurrentSessionId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
      setMessages(session.messages);
      setCurrentSessionId(sessionId);
      setAnswer("");
    }
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedSessions = chatSessions.filter(s => s.id !== sessionId);
    saveSessions(updatedSessions);
    if (currentSessionId === sessionId) {
      handleNewChat();
    }
  };

  const handleSearch = () => {
    if (!keywordRef.current.trim()) return;

    setInputValue("");
    setKeyword(keywordRef.current);

    createSearchResult(keywordRef.current);

    const newUserMessage = {
      role: "user" as const,
      content: keywordRef.current,
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);

    let currentIndex = 0;
    const typeWrite = (text: string) => {
      if (currentIndex < text.length) {
        currentIndex += 1;
        const textContent = text.slice(0, currentIndex);
        setAnswer(textContent);
        setTimeout(() => typeWrite(text), 20);
      }
    };

    setTimeout(() => {
      let currentAnswer = "";
      setLoading(true);
      getChatResult(
        keywordRef.current,
        updatedMessages,
        selectedProduct,
        (e, end) => {
          setLoading(false);
          currentIndex = currentAnswer.length;
          if (end) {
            setAnswer("");
            const finalMessages = [
              ...updatedMessages,
              {
                role: "assistant" as const,
                content: currentAnswer,
              },
            ];
            setMessages(finalMessages);

            // 保存或更新对话会话
            const sessionTitle = generateSessionTitle(finalMessages);

            if (currentSessionId) {
              // 更新现有会话
              const updatedSessions = chatSessions.map(session =>
                session.id === currentSessionId
                  ? { ...session, messages: finalMessages, title: sessionTitle }
                  : session
              );
              saveSessions(updatedSessions);
            } else {
              // 创建新会话
              const newSession: ChatSession = {
                id: Date.now().toString(),
                title: sessionTitle,
                messages: finalMessages,
                createdAt: new Date(),
              };
              const updatedSessions = [newSession, ...chatSessions];
              saveSessions(updatedSessions);
              setCurrentSessionId(newSession.id);
            }
          } else {
            currentAnswer += e;
            typeWrite(currentAnswer);
          }
        },
        (controller) => {
          setController(controller);
        }
      );
    }, 10);

    keywordRef.current = "";
  };

  const handleKeywordChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target?.value);
    keywordRef.current = e.target?.value;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  // 根据选择的知识库生成建议问题
  const getSuggestionQuestions = (): string[] => {
    switch (selectedProduct) {
      case 'forguncy':
        return [
          "如何开发银行业务系统？",
          "金融数据表设计最佳实践",
          "如何实现风险控制功能？",
          "移动端金融应用开发指南"
        ];
      case 'wyn':
        return [
          "金融数据分析和报表制作",
          "如何创建银行业绩仪表板？",
          "金融风险监控报表设计",
          "证券投资数据可视化方案"
        ];
      case 'spreadjs':
        return [
          "在金融表格计算中的应用",
          "如何处理财务报表数据？",
          "金融公式和函数使用技巧",
          "证券交易系统界面开发"
        ];
      case 'gcexcel':
        return [
          "处理大规模金融数据优化",
          "如何生成财务分析报告？",
          "银行对账单批量处理方案",
          "金融图表和数据透视表功能"
        ];
      case 'generic':
      default:
        return [
          "金融科技发展趋势和投资机会分析",
          "银行数字化转型策略和实施路径",
          "证券市场数据分析和风险评估方法",
          "保险行业创新产品设计和监管合规"
        ];
    }
  };

  // 知识库选择选项
  const knowledgeBaseOptions = [
    { label: "通用", value: "generic" },
    // 从已发布的产品/知识库获取
    ...products.map((product) => ({
      label: t(product.display_name, { defaultValue: product.name }),
      value: product.id,
    }))
  ];

  return (
    <div className="chat-container">
      <div className="chat-layout">
        {/* 左侧历史对话列表 */}
        <div className={`chat-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {!sidebarCollapsed ? (
            <>
              <div className="sidebar-content">
                <div className="sidebar-section">
                  <div className="section-title">
                    <HistoryOutlined style={{ marginRight: '8px' }} />
                    历史对话
                  </div>

                  {chatSessions.length === 0 ? (
                    <Empty
                      image={<MessageOutlined style={{ fontSize: '32px', color: '#94a3b8' }} />}
                      description="暂无历史对话"
                      style={{ padding: '20px 0' }}
                    />
                  ) : (
                    <List
                      dataSource={chatSessions}
                      renderItem={(session) => (
                        <List.Item
                          key={session.id}
                          className={`chat-session-item ${currentSessionId === session.id ? 'active' : ''}`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <div className="session-content">
                            <div className="session-title">
                              {generateSessionTitle(session.messages)}
                            </div>
                            <div className="session-time">
                              {session.createdAt.toLocaleDateString()}
                            </div>
                          </div>
                          <Button
                            type="text"
                            icon={<DeleteOutlined />}
                            size="small"
                            className="delete-session-btn"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              </div>
              <div className="sidebar-header">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleNewChat}
                  block
                  className="new-chat-button"
                >
                  新对话
                </Button>
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={toggleSidebar}
                  className="sidebar-toggle-btn"
                  title="收起侧边栏"
                />
              </div>
            </>
          ) : (
            <div className="sidebar-collapsed">
              <Tooltip title="展开侧边栏" placement="right">
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={toggleSidebar}
                  className="sidebar-expand-btn"
                />
              </Tooltip>
              <Tooltip title="新对话" placement="right">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleNewChat}
                  className="sidebar-new-chat-btn"
                />
              </Tooltip>
            </div>
          )}
        </div>

        {/* 中间聊天区域 */}
        <div className="chat-main">
          {/* 顶部导航 */}
          <div className="chat-header">
            <div className="header-content">
              <div className="header-left">
                <MessageOutlined style={{ fontSize: '20px', color: '#64748b' }} />
                <Title level={4} style={{ margin: 0, color: '#1e293b' }}>
                  智能问答助手
                </Title>
              </div>
              <div className="header-right">
                <Button
                  type="text"
                  icon={showSidebar ? <CloseOutlined /> : <FileSearchOutlined />}
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="toggle-sidebar-btn"
                >
                  {showSidebar ? '隐藏' : '显示'}搜索结果
                </Button>
              </div>
            </div>
          </div>

          {/* 聊天消息区域 */}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <BulbOutlined className="welcome-icon" />
                <Title level={3} className="welcome-title">
                  开始与AI助手对话
                </Title>
                <p className="welcome-description">
                  询问任何关于金融科技、银行业务、证券投资、保险产品等金融行业的问题，获取专业的解答和建议
                </p>
                <div className="suggestion-grid">
                  {getSuggestionQuestions().map((suggestion, index) => (
                    <Button
                      key={index}
                      className="chat-suggestion-button"
                      onClick={() => {
                        keywordRef.current = suggestion;
                        setInputValue(suggestion);
                        handleSearch();
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages-container chat-scrollbar">
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {messages.map((message, index) => (
                    <div key={index} className={`message-wrapper ${message.role}`}>
                      {message.role === 'assistant' && (
                        <Avatar
                          icon={<RobotOutlined />}
                          className="message-avatar assistant"
                        />
                      )}
                      <div className={`message-bubble ${message.role}`}>
                        <Markdown content={message.content} />
                      </div>
                      {message.role === 'user' && (
                        <Avatar
                          icon={<UserOutlined />}
                          className="message-avatar user"
                        />
                      )}
                    </div>
                  ))}
                  {(loading || (answer && answer.length > 0)) && (
                    <div className="message-wrapper assistant">
                      <Avatar
                        icon={<RobotOutlined />}
                        className="message-avatar assistant"
                      />
                      <div className="message-bubble assistant">
                        <Markdown content={answer} loading={loading} />
                      </div>
                    </div>
                  )}
                </Space>
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="chat-input-container">
            <div className="input-content">
              {/* 知识库选择器行 */}
              <div className="knowledge-base-row">
                <span className="kb-label">知识库：</span>
                <Select
                  value={selectedProduct}
                  onChange={selectProduct}
                  options={knowledgeBaseOptions}
                  className="knowledge-base-selector"
                  placeholder="选择知识库"
                  suffixIcon={<DatabaseOutlined />}
                  loading={productsLoading}
                />
                <Badge count={products.length} className="kb-badge">
                  <Tooltip title="当前可用的知识库数量">
                    <span className="kb-count-text">可用知识库</span>
                  </Tooltip>
                </Badge>
              </div>

              {/* Claude 风格的输入框 */}
              <div className="claude-input-wrapper">
                {/* 主输入区域 */}
                <div className="input-main-area">
                  <TextArea
                    value={inputValue}
                    onChange={handleKeywordChange}
                    onKeyDown={handleKeyPress}
                    placeholder="请输入您的问题... (Shift+Enter 换行，Enter 发送)"
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    className="claude-textarea"
                    bordered={false}
                  />
                </div>

                {/* 底部按钮栏 */}
                <div className="input-bottom-controls">
                  {/* 左侧功能按钮组 */}
                  <div className="input-left-buttons">
                    {/* 文件上传按钮 */}
                    <Tooltip title="上传文件">
                      <Upload
                        beforeUpload={handleFileUpload}
                        showUploadList={false}
                        accept=".pdf,.doc,.docx,.txt,.md"
                      >
                        <Button
                          type="text"
                          icon={<PaperClipOutlined />}
                          className="input-action-btn"
                        />
                      </Upload>
                    </Tooltip>

                    {/* Web搜索切换 */}
                    <Tooltip title={webSearchEnabled ? "关闭网络搜索" : "开启网络搜索"}>
                      <Button
                        type="text"
                        icon={<GlobalOutlined />}
                        className={`input-action-btn ${webSearchEnabled ? 'active' : ''}`}
                        onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                      />
                    </Tooltip>

                    {/* 深度思考模式 */}
                    <Tooltip title={deepThinkingEnabled ? "关闭深度思考" : "开启深度思考"}>
                      <Button
                        type="text"
                        icon={<ThunderboltOutlined />}
                        className={`input-action-btn ${deepThinkingEnabled ? 'active' : ''}`}
                        onClick={() => setDeepThinkingEnabled(!deepThinkingEnabled)}
                      />
                    </Tooltip>
                  </div>

                  {/* 右侧控制区 */}
                  <div className="input-right-controls">
                    {/* 模型选择下拉框 */}
                    <Dropdown
                      menu={{
                        items: modelOptions,
                        onClick: handleModelSelect,
                      }}
                      trigger={['click']}
                    >
                      <Button
                        type="text"
                        className="model-selector-btn"
                      >
                        <div className="model-selector-content">
                          <span className="current-model">
                            {selectedModel === 'gpt-4o' && 'GPT-4o'}
                            {selectedModel === 'gpt-4' && 'GPT-4'}
                            {selectedModel === 'claude-3' && 'Claude-3'}
                            {selectedModel === 'gpt-3.5-turbo' && 'GPT-3.5 Turbo'}
                          </span>
                          <DownOutlined className="dropdown-icon" />
                        </div>
                      </Button>
                    </Dropdown>

                    {/* 发送按钮 */}
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={handleSearch}
                      loading={loading}
                      disabled={!inputValue.trim()}
                      className="claude-send-button"
                    />
                  </div>
                </div>

                {/* 状态指示器 */}
                {(webSearchEnabled || deepThinkingEnabled) && (
                  <div className="input-status-indicators">
                    {webSearchEnabled && (
                      <span className="status-indicator web-search">
                        <GlobalOutlined /> 网络搜索已启用
                      </span>
                    )}
                    {deepThinkingEnabled && (
                      <span className="status-indicator deep-thinking">
                        <ThunderboltOutlined /> 深度思考模式
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧搜索结果区域 */}
        {showSidebar && (
          <div className="chat-search-sidebar">
            <div className="search-header">
              <div className="search-title">
                <FileSearchOutlined style={{ marginRight: '8px' }} />
                <span>相关搜索结果</span>
                <Badge count={searchList.length} className="search-badge" />
              </div>
            </div>

            <div className="search-content">
              {searchList.length === 0 && !searchLoading ? (
                <Empty
                  image={<FileSearchOutlined style={{ fontSize: '48px', color: '#94a3b8' }} />}
                  description={
                    <div className="empty-description">
                      <p>暂无搜索结果</p>
                      <p>开始提问以查看相关文档</p>
                    </div>
                  }
                />
              ) : (
                <div className="search-results chat-scrollbar">
                  <HitList
                    list={searchList}
                    loading={searchLoading}
                    onShowFullAnswer={(searchItem) => {
                      searchItem.show_full_answer = !searchItem.show_full_answer;
                      setSearchList([...searchList]);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="chat-footer">
        <CustomFooter />
      </div>
    </div>
  );
};

export default ChatPage;
