// import { ContentPart } from '@google/generative-ai'; // Or your generic ContentPart type

// Placeholder for Google's ContentPart type until dependencies are fully resolved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlaceholderContentPart = any;

/**
 * Defines the types of artifacts that can be stored.
 */
export enum ArtifactType {
  FILE = 'FILE',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  URL = 'URL',
  CUSTOM = 'CUSTOM', // For application-specific artifact types
}

/**
 * Represents a generic artifact produced or used by an agent.
 */
export interface Artifact {
  /** Unique identifier for the artifact. */
  id: string;

  /** Human-readable name of the artifact. */
  name: string;

  /** The type of the artifact. */
  type: ArtifactType;

  /** The actual content of the artifact. Can be a string, Buffer, stream, or complex object. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;

  /** URI or path where the artifact can be accessed (if applicable). */
  uri?: string;

  /** Timestamp of when the artifact was created or generated. */
  createdAt?: Date;

  /** Any additional custom metadata for this artifact. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/**
 * Interface for managing artifacts (e.g., files, blobs) related to agent interactions.
 */
export interface IArtifactService {
  /**
   * Saves an artifact.
   * @param sessionId The ID of the session this artifact is associated with.
   * @param interactionId The ID of the interaction within the session.
   * @param name A human-readable name for the artifact.
   * @param content The actual content of the artifact.
   * @param type The type of the artifact (defaults to FILE).
   * @param metadata Optional metadata for the artifact.
   * @returns A Promise resolving to the saved Artifact object.
   */
  saveArtifact(
    sessionId: string,
    interactionId: string,
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: any,
    type?: ArtifactType,
    metadata?: Record<string, any>
  ): Promise<Artifact>;

  /**
   * Retrieves an artifact by its ID.
   * @param artifactId The ID of the artifact to retrieve.
   * @returns A Promise resolving to the Artifact object, or null if not found.
   */
  getArtifact(artifactId: string): Promise<Artifact | null>;

  /**
   * Lists artifacts, potentially filtered by session, interaction, or type.
   * @param sessionId The ID of the session to list artifacts for.
   * @param interactionId Optional ID of the interaction to filter by.
   * @param type Optional artifact type to filter by.
   * @returns A Promise resolving to a list of Artifact objects.
   */
  listArtifacts(
    sessionId: string,
    interactionId?: string,
    type?: ArtifactType
  ): Promise<Artifact[]>;

  /**
   * Deletes an artifact by its ID.
   * @param artifactId The ID of the artifact to delete.
   * @returns A Promise resolving to true if deletion was successful, false otherwise.
   */
  deleteArtifact(artifactId: string): Promise<boolean>;
} 