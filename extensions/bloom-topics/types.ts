// Extension-specific types for bloom-topics

/** Metadata for a conversation topic within a session. */
export interface TopicInfo {
	name: string;
	status: "active" | "closed";
	branchPoint: string | undefined;
}
