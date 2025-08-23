const API_BASE = import.meta.env.MODE === "development" ? "http://115.27.162.243:8000/api" : "/api";

export const fetchProducts = async () => {
    const res = await fetch(`${API_BASE}/products`);
    return (await res.json()).products as string[];
};

export const fetchFilesStatus = async (product: string) => {
    const res = await fetch(`${API_BASE}/files_status?product=${product}`);
    return (await res.json()).files as any[];
};

export const createProduct = async (product: string) => {
    const form = new FormData();
    form.append("product", product);
    const res = await fetch(`${API_BASE}/create_product`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw new Error((await res.json()).detail || "创建失败");
    return await res.json();
};

export const fetchConfig = async () => {
    const res = await fetch(`${API_BASE}/get_config`);
    return await res.json();
};

export const saveConfig = async (config: any) => {
    const res = await fetch(`${API_BASE}/update_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("保存失败");
    return true;
};

export const uploadFile = async (product: string, file: File) => {
    const formData = new FormData();
    formData.append("product", product);
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/das_upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error("上传失败");
    return await res.json();
};

export const dasStart = async (product: string, filename: string) => {
    const form = new FormData();
    form.append("product", product);
    form.append("filename", filename);
    const res = await fetch(`${API_BASE}/das_start`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw new Error("DAS处理启动失败");
    return await res.json();
};

export const fetchDasProgress = async (taskId: string) => {
    const res = await fetch(`${API_BASE}/das_progress?task_id=${taskId}`);
    if (!res.ok) throw new Error("获取进度失败");
    return await res.json();
};

export const fetchEtlProgress = async (taskId: string) => {
    const res = await fetch(`${API_BASE}/etl_progress?task_id=${taskId}`);
    if (!res.ok) throw new Error("获取进度失败");
    return await res.json();
};

export const etlStart = async (product: string, etlType: "embedding" | "qa" | "full", filename: string) => {
    const form = new FormData();
    form.append("product", product);
    form.append("etl_type", etlType);
    form.append("filename", filename);
    const res = await fetch(`${API_BASE}/etl_start`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        const errorData = await res.json();
        // 如果是配置错误，显示详细信息
        if (errorData.error && errorData.details) {
            throw new Error(`${errorData.error}: ${errorData.details.join(", ")}`);
        }
        throw new Error(errorData.detail || errorData.error || "ETL处理启动失败");
    }
    return await res.json();
};

export const fetchDasResultContent = async (product: string, filename: string) => {
    const res = await fetch(`${API_BASE}/das_result_content?product=${product}&filename=${filename}`);
    if (!res.ok) throw new Error("获取DAS结果失败");
    return await res.json();
};

export const fetchEtlResultContent = async (product: string, etlType: "embedding" | "qa" | "full", filename: string) => {
    const res = await fetch(`${API_BASE}/etl_result_content?product=${product}&etl_type=${etlType}&filename=${filename}`);
    if (!res.ok) throw new Error("获取ETL结果失败");
    return await res.json();
};

export const publish = async (product: string, tag: string) => {
    const form = new FormData();
    form.append("product", product);
    form.append("tag", tag);
    const res = await fetch(`${API_BASE}/publish`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw new Error("发布失败");
    return await res.json();
};

export const fetchServerLog = async (lines: number = 100) => {
    const res = await fetch(`${API_BASE}/server_log?lines=${lines}`);
    if (!res.ok) throw new Error("日志获取失败");
    return await res.json();
};

export const updateAliases = async (product: string, tag: string) => {
    const form = new FormData();
    form.append("product", product);
    form.append("tag", tag);
    const res = await fetch(`${API_BASE}/update_aliases`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw new Error("更新别名失败");
    return await res.json();
};

export const fetchPublishProgress = async (taskId: string) => {
    const res = await fetch(`${API_BASE}/publish_progress?task_id=${taskId}`);
    if (!res.ok) throw new Error("获取进度失败");
    return await res.json();
};

export const fetchVectorCollections = async () => {
    const res = await fetch(`${API_BASE}/vector_collections`);
    if (!res.ok) throw new Error("获取向量数据库信息失败");
    return await res.json();
};

export const deleteFile = async (product: string, filename: string) => {
    const res = await fetch(`${API_BASE}/delete_file?product=${product}&filename=${filename}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("删除文件失败");
    return await res.json();
};

export const deleteFiles = async (product: string, filenames: string[]) => {
    const form = new FormData();
    form.append("product", product);
    form.append("filenames", filenames.join(","));
    const res = await fetch(`${API_BASE}/delete_files`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw new Error("批量删除失败");
    return await res.json();
}; 