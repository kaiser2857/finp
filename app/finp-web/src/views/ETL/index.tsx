import React, { useState, useEffect } from "react";
import { Button, Card, Space, Typography, Popconfirm, message, Empty, Badge, Tooltip } from "antd";
import {
  DeleteOutlined,
  CloudUploadOutlined,
  SettingOutlined,
  RocketOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  InboxOutlined,
  HistoryOutlined,
  SafetyOutlined
} from "@ant-design/icons";
import ProductSelector from "./components/ProductSelector";
import FileStatusTable from "./components/FileStatusTable";
import ServerLog from "./components/ServerLog";
import PublishModal from "./components/PublishModal";
import PreviewModal from "./components/PreviewModal";
import NewProductModal from "./components/NewProductModal";
import ConfigModal from "./components/ConfigModal";
import {
  fetchProducts,
  fetchFilesStatus,
  createProduct,
  fetchConfig,
  saveConfig,
  uploadFile,
  dasStart,
  fetchDasProgress,
  etlStart,
  fetchEtlProgress,
  fetchDasResultContent,
  fetchEtlResultContent,
  publish,
  fetchServerLog,
  updateAliases,
  fetchPublishProgress,
  deleteFile,
  deleteFiles,
} from "./api/ApiService";

const GenericETL: React.FC = () => {
  // const { message } = App.useApp();

  // DAS
  const [product, setProduct] = useState<string>("default");
  const [previewModal, setPreviewModal] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [newProductModal, setNewProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState("");

  // Related to publishing
  const [publishModal, setPublishModal] = useState(false);
  const [publishTag, setPublishTag] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [updatingAliases, setUpdatingAliases] = useState(false);

  // New table data
  const [etlFileRows, setEtlFileRows] = useState<any[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Handle loading
  const [processing, setProcessing] = useState<{ [k: string]: boolean }>({});

  // 添加进度状态管理
  const [progressInfo, setProgressInfo] = useState<{ [k: string]: { progress: number; msg: string } }>({});

  // Added: log related state
  const [serverLog, setServerLog] = useState<string>("");

  // Added: config related state
  const [configModal, setConfigModal] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // DAS 相关 effect
  // DAS related effect
  useEffect(() => {
    fetchProducts().then(setProducts);
  }, []);

  useEffect(() => {
    if (products.length && !products.includes(product)) {
      setProduct(products[0]);
    }
  }, [products]);

  useEffect(() => {
    if (product) {
      fetchFilesStatus(product).then(setEtlFileRows);
    }
  }, [product]);

  // Periodically fetch logs
  useEffect(() => {
    const fetchLog = async () => {
      try {
        const data = await fetchServerLog(100);
        setServerLog(data.log || "");
      } catch {
        setServerLog("日志获取失败");
      }
    };
    fetchLog();
    const timer = setInterval(fetchLog, 3000);
    return () => clearInterval(timer);
  }, []);

  // Create product
  const handleCreateProduct = async () => {
    if (!newProductName) return;
    try {
      await createProduct(newProductName);
      message.success("产品创建成功");
      setProduct(newProductName);
      setNewProductModal(false);
      setNewProductName("");
      fetchProducts().then(setProducts);
    } catch (e: any) {
      message.error(e.message || "创建失败");
    }
  };

  // Single file DAS processing
  const handleDasProcess = async (row: any) => {
    setProcessing((p) => ({ ...p, [row.filename + ":das"]: true }));
    try {
      const response = await dasStart(product, row.filename);
      const taskId = response.task_id;

      // 轮询查询进度
      const pollProgress = async () => {
        try {
          const progress = await fetchDasProgress(taskId);
          console.log(`DAS进度 - ${row.filename}: ${progress.status} (${progress.progress}%) - ${progress.msg}`);

          // 更新进度信息
          setProgressInfo((prev) => ({
            ...prev,
            [row.filename + ":das"]: {
              progress: progress.progress || 0,
              msg: progress.msg || ""
            }
          }));

          if (progress.status === "done" || progress.status === "error") {
            setProcessing((p) => ({ ...p, [row.filename + ":das"]: false }));
            // 清除进度信息
            setProgressInfo((prev) => {
              const newInfo = { ...prev };
              delete newInfo[row.filename + ":das"];
              return newInfo;
            });
            if (progress.status === "error") {
              message.error(`DAS处理失败: ${progress.msg}`);
            } else {
              message.success(`DAS处理完成: ${row.filename}`);
            }
            // 刷新文件状态
            fetchFilesStatus(product).then(setEtlFileRows);
            return;
          }

          // 继续轮询
          setTimeout(pollProgress, 2000);
        } catch (error) {
          console.error("获取进度失败:", error);
          setProcessing((p) => ({ ...p, [row.filename + ":das"]: false }));
          // 清除进度信息
          setProgressInfo((prev) => {
            const newInfo = { ...prev };
            delete newInfo[row.filename + ":das"];
            return newInfo;
          });
          message.error("获取进度失败");
        }
      };

      // 开始轮询
      setTimeout(pollProgress, 1000);

    } catch (error: any) {
      setProcessing((p) => ({ ...p, [row.filename + ":das"]: false }));
      message.error(error.message || "DAS处理启动失败");
    }
  };

  // Single file ETL processing
  const handleEtlProcess = async (
    row: any,
    etlType: "embedding" | "qa" | "full"
  ) => {
    setProcessing((p) => ({ ...p, [row.filename + ":" + etlType]: true }));
    try {
      const response = await etlStart(product, etlType, row.das.resultFile);
      const taskId = response.task_id;

      // 轮询查询进度
      const pollProgress = async () => {
        try {
          const progress = await fetchEtlProgress(taskId);
          console.log(`ETL-${etlType}进度 - ${row.filename}: ${progress.status} (${progress.progress}%) - ${progress.msg}`);

          // 更新进度信息
          setProgressInfo((prev) => ({
            ...prev,
            [row.filename + ":" + etlType]: {
              progress: progress.progress || 0,
              msg: progress.msg || ""
            }
          }));

          if (progress.status === "done" || progress.status === "error") {
            setProcessing((p) => ({ ...p, [row.filename + ":" + etlType]: false }));
            // 清除进度信息
            setProgressInfo((prev) => {
              const newInfo = { ...prev };
              delete newInfo[row.filename + ":" + etlType];
              return newInfo;
            });
            if (progress.status === "error") {
              message.error(`ETL-${etlType}处理失败: ${progress.msg}`);
            } else {
              message.success(`ETL-${etlType}处理完成: ${row.filename}`);
            }
            // 刷新文件状态
            fetchFilesStatus(product).then(setEtlFileRows);
            return;
          }

          // 继续轮询
          setTimeout(pollProgress, 2000);
        } catch (error) {
          console.error("获取ETL进度失败:", error);
          setProcessing((p) => ({ ...p, [row.filename + ":" + etlType]: false }));
          // 清除进度信息
          setProgressInfo((prev) => {
            const newInfo = { ...prev };
            delete newInfo[row.filename + ":" + etlType];
            return newInfo;
          });
          message.error("获取ETL进度失败");
        }
      };

      // 开始轮询
      setTimeout(pollProgress, 1000);

    } catch (error: any) {
      setProcessing((p) => ({ ...p, [row.filename + ":" + etlType]: false }));
      message.error(error.message || `ETL-${etlType}处理启动失败`);
    }
  };

  // Batch processing
  const handleBatchProcess = async (
    stage: "das" | "embedding" | "qa" | "full"
  ) => {
    for (const row of etlFileRows.filter((r) =>
      selectedRowKeys.includes(r.filename)
    )) {
      if (stage === "das" && row.das.status === "not_started") {
        await handleDasProcess(row);
      } else if (
        ["embedding", "qa", "full"].includes(stage) &&
        row[stage].status === "not_started"
      ) {
        await handleEtlProcess(row, stage as any);
      }
    }
    fetchFilesStatus(product).then(setEtlFileRows);
  };

  // Single file content preview
  const handlePreview = async (
    row: any,
    stage: "das" | "embedding" | "qa" | "full"
  ) => {
    let content = null;
    let title = "";
    if (stage === "das" && row.das.resultFile) {
      content = await fetchDasResultContent(product, row.das.resultFile);
      title = `${row.filename} - DAS`;
    } else if (
      (stage === "embedding" || stage === "qa" || stage === "full") &&
      row[stage].resultFile
    ) {
      const etlType = stage;
      content = await fetchEtlResultContent(
        product,
        etlType,
        row[stage].resultFile
      );
      title = `${row.filename} - ${stage}`;
    }
    setPreviewContent(content);
    setPreviewTitle(title);
    setPreviewModal(true);
  };

  // Publish to vector database
  const handlePublish = async () => {
    if (!publishTag) {
      message.error("请输入发布标签");
      return;
    }
    setPublishing(true);
    try {
      const response = await publish(product, publishTag);
      const taskId = response.task_id;
      message.success("发布任务已启动");

      // 轮询查询进度
      const pollProgress = async () => {
        try {
          const progress = await fetchPublishProgress(taskId);
          console.log(`发布进度: ${progress.status} (${progress.progress}%) - ${progress.msg}`);

          if (progress.status === "done" || progress.status === "error") {
            setPublishing(false);
            if (progress.status === "error") {
              message.error(`发布失败: ${progress.msg}`);
              setPublishModal(false);
              setPublishTag("");
            } else {
              message.success("发布完成！现在可以选择是否更新生产别名");
              // 不关闭 modal，让用户选择下一步操作
            }
            return;
          }

          // 继续轮询
          setTimeout(pollProgress, 2000);
        } catch (error) {
          console.error("获取发布进度失败:", error);
          setPublishing(false);
          message.error("获取发布进度失败");
        }
      };

      // 开始轮询
      setTimeout(pollProgress, 1000);

    } catch (e: any) {
      message.error(e.message || "发布失败");
      setPublishing(false);
    }
  };

  // Update aliases
  const handleUpdateAliases = async () => {
    if (!publishTag) {
      message.error("请输入发布标签");
      return;
    }
    setUpdatingAliases(true);
    try {
      const response = await updateAliases(product, publishTag);
      const taskId = response.task_id;
      message.success("更新别名任务已启动");

      // 轮询查询进度
      const pollProgress = async () => {
        try {
          const progress = await fetchPublishProgress(taskId);
          console.log(`更新别名进度: ${progress.status} (${progress.progress}%) - ${progress.msg}`);

          if (progress.status === "done" || progress.status === "error") {
            setUpdatingAliases(false);
            if (progress.status === "error") {
              message.error(`更新别名失败: ${progress.msg}`);
            } else {
              message.success("生产别名更新完成！新版本已上线");
            }
            // 完成后关闭 modal 并重置状态
            setPublishModal(false);
            setPublishTag("");
            return;
          }

          // 继续轮询
          setTimeout(pollProgress, 2000);
        } catch (error) {
          console.error("获取更新别名进度失败:", error);
          setUpdatingAliases(false);
          message.error("获取更新别名进度失败");
        }
      };

      // 开始轮询
      setTimeout(pollProgress, 1000);

    } catch (e: any) {
      message.error(e.message || "更新别名失败");
      setUpdatingAliases(false);
    }
  };

  // Delete file functions
  const handleDeleteFile = async (filename: string) => {
    try {
      await deleteFile(product, filename);
      message.success(`文件 ${filename} 已删除`);
      fetchFilesStatus(product).then(setEtlFileRows);
    } catch (e: any) {
      message.error(e.message || "删除失败");
    }
  };

  // Batch delete files
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请选择要删除的文件");
      return;
    }

    try {
      const filenames = selectedRowKeys as string[];
      const result = await deleteFiles(product, filenames);

      if (result.deleted && result.deleted.length > 0) {
        message.success(`成功删除 ${result.deleted.length} 个文件`);
      }

      if (result.failed && result.failed.length > 0) {
        message.warning(`${result.failed.length} 个文件删除失败`);
      }

      setSelectedRowKeys([]);
      fetchFilesStatus(product).then(setEtlFileRows);
    } catch (e: any) {
      message.error(e.message || "批量删除失败");
    }
  };

  const { Title } = Typography;

  // 新增拖拽上传状态
  const [dragOver, setDragOver] = useState(false);

  // 新增文件上传处理
  const handleFileUpload = async (file: File) => {
    try {
      await uploadFile(product, file);
      message.success("上传成功");
      fetchFilesStatus(product).then(setEtlFileRows);
    } catch (e: any) {
      message.error(e.message || "上传失败");
    }
  };

  // 拖拽事件处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFileUpload);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '16px 0',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        style={{
          width: '100%',
          // Responsive content width: grows with viewport but capped for readability
          maxWidth: 'clamp(1200px, 94vw, 1680px)',
          margin: '0 auto',
          padding: '0 clamp(12px, 2vw, 24px)',
          position: 'relative',
        }}
      >
        {/* 拖拽覆盖层 */}
        {dragOver && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(148, 163, 184, 0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <InboxOutlined style={{ fontSize: '64px', marginBottom: '16px' }} />
              <div>拖放文件到此处上传</div>
            </div>
          </div>
        )}

        {/* 主标题卡片 */}
        <Card
          style={{
            marginBottom: 16,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: 'none',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(148, 163, 184, 0.1)',
            overflow: 'hidden'
          }}
        >

          {/* 控制区域 */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ flex: 1, minWidth: '360px' }}>
              <ProductSelector
                products={products}
                product={product}
                setProduct={setProduct}
                onNewProduct={() => setNewProductModal(true)}
                onUpload={handleFileUpload}
              />
            </div>
            <Space size="middle">
              <Tooltip title="系统配置">
                <Button
                  type="default"
                  icon={<SettingOutlined />}
                  style={{
                    borderRadius: '8px',
                    height: '40px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  onClick={() => {
                    setConfigModal(true);
                    setConfigLoading(true);
                    fetchConfig()
                      .then((cfg) => setConfig(cfg))
                      .finally(() => setConfigLoading(false));
                  }}
                >
                  配置
                </Button>
              </Tooltip>
              <Tooltip title="发布到向量数据库">
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  style={{
                    borderRadius: '8px',
                    height: '40px',
                    background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                    border: 'none',
                    boxShadow: '0 4px 16px rgba(100, 116, 139, 0.2)'
                  }}
                  onClick={() => setPublishModal(true)}
                >
                  发布到向量数据库
                </Button>
              </Tooltip>
            </Space>
          </div>
        </Card>
        {/* 文件处理状态卡片 */}
        {etlFileRows.length === 0 ? (
          <Card
            style={{
              marginTop: 16,
              borderRadius: '16px',
              border: 'none',
              boxShadow: '0 4px 20px rgba(148, 163, 184, 0.1)',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            }}
          >
            <Empty
              image={<InboxOutlined style={{ fontSize: '64px', color: '#64748b' }} />}
              description={
                <div style={{ textAlign: 'center' }}>
                  <Title level={4} style={{ color: '#64748b', margin: '16px 0 8px 0' }}>
                    暂无数据文件
                  </Title>
                  <p style={{ color: '#8c8c8c', margin: '0 0 24px 0' }}>
                    请上传文档开始处理流程
                  </p>
                  <div style={{
                    padding: '32px',
                    border: '2px dashed #e2e8f0',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    transition: 'all 0.3s ease'
                  }}>
                    <CloudUploadOutlined style={{ fontSize: '48px', color: '#64748b', marginBottom: '16px' }} />
                    <p style={{ fontSize: '16px', margin: 0, color: '#64748b' }}>
                      拖拽文件到此处或点击上传按钮
                    </p>
                  </div>
                </div>
              }
            />
          </Card>
        ) : (
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileTextOutlined style={{ color: '#64748b' }} />
                <span>文件全流程状态</span>
                <Badge count={etlFileRows.length} style={{ backgroundColor: '#64748b' }} />
              </div>
            }
            style={{
              marginTop: 16,
              borderRadius: '16px',
              border: 'none',
              boxShadow: '0 4px 20px rgba(148, 163, 184, 0.1)',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            }}
            extra={
              <Space wrap>
                <Tooltip title="批量数据源解析">
                  <Button
                    disabled={selectedRowKeys.length === 0}
                    icon={<ThunderboltOutlined />}
                    style={{
                      borderRadius: '8px',
                      boxShadow: selectedRowKeys.length > 0 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                    onClick={() => handleBatchProcess("das")}
                  >
                    批量DAS
                  </Button>
                </Tooltip>
                <Tooltip title="批量问答生成">
                  <Button
                    disabled={selectedRowKeys.length === 0}
                    icon={<EyeOutlined />}
                    style={{
                      borderRadius: '8px',
                      boxShadow: selectedRowKeys.length > 0 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                    onClick={() => handleBatchProcess("qa")}
                  >
                    批量QA
                  </Button>
                </Tooltip>
                <Tooltip title="批量完整答案生成">
                  <Button
                    disabled={selectedRowKeys.length === 0}
                    icon={<SafetyOutlined />}
                    style={{
                      borderRadius: '8px',
                      boxShadow: selectedRowKeys.length > 0 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                    onClick={() => handleBatchProcess("full")}
                  >
                    批量FullAnswer
                  </Button>
                </Tooltip>
                <Tooltip title="批量向量化">
                  <Button
                    disabled={selectedRowKeys.length === 0}
                    icon={<DatabaseOutlined />}
                    style={{
                      borderRadius: '8px',
                      boxShadow: selectedRowKeys.length > 0 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                    onClick={() => handleBatchProcess("embedding")}
                  >
                    批量Embedding
                  </Button>
                </Tooltip>
                <Popconfirm
                  title="确认批量删除"
                  description={`确定要删除选中的 ${selectedRowKeys.length} 个文件及其所有处理结果吗？`}
                  onConfirm={handleBatchDelete}
                  okText="确定"
                  cancelText="取消"
                  disabled={selectedRowKeys.length === 0}
                >
                  <Tooltip title="批量删除文件">
                    <Button
                      disabled={selectedRowKeys.length === 0}
                      danger
                      icon={<DeleteOutlined />}
                      style={{
                        borderRadius: '8px',
                        boxShadow: selectedRowKeys.length > 0 ? '0 2px 8px rgba(255,77,79,0.2)' : 'none'
                      }}
                    >
                      批量删除
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Space>
            }
          >
            <FileStatusTable
              etlFileRows={etlFileRows}
              selectedRowKeys={selectedRowKeys}
              setSelectedRowKeys={setSelectedRowKeys}
              handleDasProcess={handleDasProcess}
              handleEtlProcess={handleEtlProcess}
              handlePreview={handlePreview}
              handleDeleteFile={handleDeleteFile}
              processing={processing}
              progressInfo={progressInfo}
              product={product}
            />
          </Card>
        )}

        {/* 日志卡片 */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HistoryOutlined style={{ color: '#64748b' }} />
              <span>数据解析日志</span>
            </div>
          }
          style={{
            marginTop: 16,
            borderRadius: '16px',
            border: 'none',
            boxShadow: '0 4px 20px rgba(148, 163, 184, 0.1)',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          }}
        >
          <ServerLog serverLog={serverLog} />
        </Card>
      </div>

      {/* 模态框组件 */}
      <PublishModal
        open={publishModal}
        product={product}
        publishTag={publishTag}
        setPublishTag={setPublishTag}
        onCancel={() => {
          setPublishModal(false);
          setPublishTag("");
        }}
        onOk={handlePublish}
        onUpdateAliases={handleUpdateAliases}
        confirmLoading={publishing}
        updateAliasesLoading={updatingAliases}
      />
      <PreviewModal
        open={previewModal}
        title={previewTitle}
        content={previewContent}
        onCancel={() => setPreviewModal(false)}
      />
      <NewProductModal
        open={newProductModal}
        newProductName={newProductName}
        setNewProductName={setNewProductName}
        onCancel={() => setNewProductModal(false)}
        onOk={handleCreateProduct}
      />
      <ConfigModal
        open={configModal}
        config={config}
        configLoading={configLoading}
        configSaving={configSaving}
        setConfig={setConfig}
        onCancel={() => setConfigModal(false)}
        onOk={async () => {
          setConfigSaving(true);
          try {
            await saveConfig(config);
            setConfigModal(false);
          } catch (e) {
            message.error("保存失败");
          } finally {
            setConfigSaving(false);
          }
        }}
      />
    </div>
  );
};

export default GenericETL;
