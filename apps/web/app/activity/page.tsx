"use client";

import ActivityFeed from "@/components/ActivityFeed";

export default function ActivityPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <ActivityFeed showLoadMore compact={false} initialLimit={30} />
    </div>
  );
}
