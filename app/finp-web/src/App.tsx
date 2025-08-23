import * as React from "react";
import "./App.css";
import { ConfigProvider, Flex } from "antd";

import { HashRouter as Router, Route, Routes } from "react-router-dom";

const ChatPage = React.lazy(() => import("./views/Chat"));
const SearchPage = React.lazy(() => import("./views/Search"));
const ETLPage = React.lazy(() => import("./views/ETL"));

function App() {
  return (
    <ConfigProvider theme={{ token: { borderRadius: 4 } }}>
      <Router>
        <Routes>
          <Route
            path="/chat"
            element={
              <Flex gap="middle" vertical align="center">
                <React.Suspense fallback={<div />}>
                  <ChatPage />
                </React.Suspense>
              </Flex>
            }
          ></Route>
          <Route
            path="/search"
            element={
              <Flex gap="middle" vertical align="center">
                <React.Suspense fallback={<div />}>
                  <SearchPage />
                </React.Suspense>
              </Flex>
            }
          ></Route>
          <Route
            path="/ETL"
            element={
              <React.Suspense fallback={<div />}>
                <ETLPage />
              </React.Suspense>
            }
          ></Route>
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App;
