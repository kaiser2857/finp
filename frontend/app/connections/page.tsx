"use client"

import React from "react"
import { DatabaseConnectionManager } from "@/components/database-connection-manager"

export default function ConnectionsPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <DatabaseConnectionManager />
    </div>
  )
}
