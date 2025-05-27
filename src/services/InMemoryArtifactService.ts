import { IArtifactService, Artifact, ArtifactType } from './IArtifactService.js';
import { v4 as uuidv4 } from 'uuid';

interface StoredArtifact extends Artifact {
  sessionId: string;
  interactionId: string;
  storedAt: Date;
}

/**
 * An in-memory implementation of the IArtifactService.
 * Useful for development and testing.
 * Note: Data will be lost when the process exits.
 */
export class InMemoryArtifactService implements IArtifactService {
  private artifacts: Map<string, StoredArtifact> = new Map(); // artifactId -> Artifact

  async saveArtifact(
    sessionId: string,
    interactionId: string,
    name: string,
    content: any,
    type: ArtifactType = ArtifactType.FILE,
    metadata?: Record<string, any>
  ): Promise<Artifact> {
    const artifactId = uuidv4();
    const newArtifact: StoredArtifact = {
      id: artifactId,
      name,
      type,
      content,
      uri: `mem://${sessionId}/${interactionId}/${artifactId}/${name}`,
      createdAt: new Date(),
      metadata: metadata || {},
      // InMemory specific fields
      sessionId,
      interactionId,
      storedAt: new Date(),
    };
    this.artifacts.set(artifactId, newArtifact);
    // Return a copy that matches the Artifact interface (omitting StoredArtifact specific fields if any were not in Artifact)
    const { sessionId: _s, interactionId: _i, storedAt: _st, ...artifactToReturn } = newArtifact;
    return artifactToReturn as Artifact; 
  }

  async getArtifact(artifactId: string): Promise<Artifact | null> {
    const storedArtifact = this.artifacts.get(artifactId);
    if (!storedArtifact) return null;
    const { sessionId: _s, interactionId: _i, storedAt: _st, ...artifactToReturn } = storedArtifact;
    return artifactToReturn as Artifact;
  }

  async listArtifacts(
    sessionId: string,
    interactionId?: string,
    type?: ArtifactType
  ): Promise<Artifact[]> {
    let filtered = Array.from(this.artifacts.values())
                        .filter(art => art.sessionId === sessionId);

    if (interactionId) {
      filtered = filtered.filter(art => art.interactionId === interactionId);
    }
    if (type) {
      filtered = filtered.filter(art => art.type === type);
    }
    return filtered.map(storedArt => {
      const { sessionId: _s, interactionId: _i, storedAt: _st, ...artifactToReturn } = storedArt;
      return artifactToReturn as Artifact;
    });
  }

  async deleteArtifact(artifactId: string): Promise<boolean> {
    return this.artifacts.delete(artifactId);
  }

  // Helper to clear all artifacts, useful for testing
  clearAllArtifacts(): void {
    this.artifacts.clear();
  }
} 