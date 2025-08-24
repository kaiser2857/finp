import * as React from "react";
import "./App.css";
import { ConfigProvider, Flex } from "antd";
import { Routes, Route, Navigate } from "react-router-dom";

const ChatPage = React.lazy(() => import("./views/Chat"));
const SearchPage = React.lazy(() => import("./views/Search"));
const ETLPage = React.lazy(() => import("./views/ETL"));

function App() {
  return (
    <ConfigProvider theme={{ token: { borderRadius: 4 } }}>
      <React.Suspense fallback={<div>Loading...</div>}>
        <Routes>
          {/* 默认重定向到 /chat */}
          <Route path="/" element={<Navigate to="/chat" replace />} />

          <Route
            path="/chat"
            element={
              <Flex gap="middle" vertical align="center">
                <ChatPage />
              </Flex>
            }
          />
          <Route
            path="/search"
            element={
              <Flex gap="middle" vertical align="center">
                <SearchPage />
              </Flex>
            }
          />
          <Route
            path="/ETL"
            element={
              <Flex gap="middle" vertical align="center">
                <ETLPage />
              </Flex>
            }
          />
        </Routes>
      </React.Suspense>
    </ConfigProvider>
  );
}

export default App;
