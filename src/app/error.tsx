"use client";
import { Failure } from "@/components/feedback";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="page">
      <Failure
        message="This page could not load. Please try again."
        retry={reset}
      />
    </div>
  );
}
