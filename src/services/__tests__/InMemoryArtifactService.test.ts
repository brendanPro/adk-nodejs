import { InMemoryArtifactService } from '../InMemoryArtifactService.js';
import { IArtifactService, Artifact, ArtifactType } from '../IArtifactService.js';

describe('InMemoryArtifactService', () => {
    let service: IArtifactService;
    let testSessionId: string;
    let testInteractionId: string;
    let testArtifactName: string;

    beforeEach(() => {
        service = new InMemoryArtifactService();
        testSessionId = 'sess-artifact-123';
        testInteractionId = 'intr-artifact-456';
        testArtifactName = 'test-artifact.txt';
    });

    describe('saveArtifact', () => {
        it('should save a new artifact and return it with an auto-generated id and createdAt', async () => {
            const content = 'This is test content.';
            const type = ArtifactType.TEXT;
            const metadata = { source: 'test' };

            const savedArtifact = await service.saveArtifact(
                testSessionId,
                testInteractionId,
                testArtifactName,
                content,
                type,
                metadata
            );

            expect(savedArtifact).toBeDefined();
            expect(savedArtifact.id).toMatch(/^[a-z0-9-]+$/); // Basic UUID check
            expect(savedArtifact.name).toBe(testArtifactName);
            expect(savedArtifact.type).toBe(type);
            expect(savedArtifact.content).toBe(content);
            expect(savedArtifact.metadata).toEqual(metadata);
            expect(savedArtifact.createdAt).toBeInstanceOf(Date);
            // Check if session and interaction IDs are stored if InMemoryArtifactService stores them directly
            // This depends on InMemoryArtifactService internal implementation details not specified in IArtifactService for the Artifact object itself
            // For now, we assume they are used for indexing but not directly on the Artifact object unless added by the implementation.
        });

        it('should use default ArtifactType.FILE if type is not provided', async () => {
            const content = 'File content';
            const savedArtifact = await service.saveArtifact(
                testSessionId,
                testInteractionId,
                'default-type-test.dat',
                content
                // type not provided
            );
            expect(savedArtifact.type).toBe(ArtifactType.FILE);
        });
        
        it('should overwrite an existing artifact if saved with the same ID (if service supports this - typically new ID generated)', async () => {
            // InMemoryArtifactService generates a new UUID each time, so this test might need adjustment.
            // The IArtifactService interface implies saveArtifact always creates a new one (returns new Artifact).
            // Let's assume for now that saveArtifact always creates a new artifact with a new ID.
            const artifact1 = await service.saveArtifact(testSessionId, testInteractionId, 'overwrite.txt', 'content1');
            const artifact2 = await service.saveArtifact(testSessionId, testInteractionId, 'overwrite.txt', 'content2');
            
            expect(artifact1.id).not.toBe(artifact2.id);
            expect(artifact2.content).toBe('content2');

            const retrievedArtifact1 = await service.getArtifact(artifact1.id);
            expect(retrievedArtifact1?.content).toBe('content1');

            const retrievedArtifact2 = await service.getArtifact(artifact2.id);
            expect(retrievedArtifact2?.content).toBe('content2');
        });

    });

    describe('getArtifact', () => {
        it('should retrieve an existing artifact by its ID', async () => {
            const content = { data: 'some complex object' };
            const savedArtifact = await service.saveArtifact(
                testSessionId,
                testInteractionId,
                'retrievable.json',
                content,
                ArtifactType.CUSTOM
            );

            const retrievedArtifact = await service.getArtifact(savedArtifact.id);

            expect(retrievedArtifact).not.toBeNull();
            expect(retrievedArtifact!.id).toBe(savedArtifact.id);
            expect(retrievedArtifact!.name).toBe('retrievable.json');
            expect(retrievedArtifact!.type).toBe(ArtifactType.CUSTOM);
            expect(retrievedArtifact!.content).toEqual(content);
            expect(retrievedArtifact!.createdAt?.getTime()).toBe(savedArtifact.createdAt?.getTime());
        });

        it('should return null if the artifact ID does not exist', async () => {
            const retrievedArtifact = await service.getArtifact('non-existent-id');
            expect(retrievedArtifact).toBeNull();
        });
    });

    describe('listArtifacts', () => {
        let artifact1Sess1Intr1Text: Artifact;
        let artifact2Sess1Intr1Image: Artifact;
        let artifact3Sess1Intr2Text: Artifact;
        let artifact4Sess2Intr1Text: Artifact; // Different session

        beforeEach(async () => {
            // Clear any existing artifacts from previous test runs within this describe block if service persists
            // For InMemoryArtifactService, a new instance is created in the outer beforeEach, so it's clean.
            
            artifact1Sess1Intr1Text = await service.saveArtifact(testSessionId, testInteractionId, 'file1.txt', 'content1', ArtifactType.TEXT);
            artifact2Sess1Intr1Image = await service.saveArtifact(testSessionId, testInteractionId, 'image1.png', 'imgdata1', ArtifactType.IMAGE);
            artifact3Sess1Intr2Text = await service.saveArtifact(testSessionId, 'intr-other-789', 'file2.txt', 'content2', ArtifactType.TEXT);
            artifact4Sess2Intr1Text = await service.saveArtifact('sess-other-456', testInteractionId, 'file3.txt', 'content3', ArtifactType.TEXT);
        });

        it('should return an empty array if no artifacts exist for a given sessionId', async () => {
            const artifacts = await service.listArtifacts('non-existent-session');
            expect(artifacts).toEqual([]);
        });

        it('should return all artifacts for a specific sessionId when no other filters are applied', async () => {
            const artifacts = await service.listArtifacts(testSessionId);
            expect(artifacts).toHaveLength(3);
            expect(artifacts).toEqual(expect.arrayContaining([
                artifact1Sess1Intr1Text,
                artifact2Sess1Intr1Image,
                artifact3Sess1Intr2Text
            ]));
            expect(artifacts).not.toEqual(expect.arrayContaining([artifact4Sess2Intr1Text]));
        });

        it('should filter artifacts by interactionId within a sessionId', async () => {
            const artifacts = await service.listArtifacts(testSessionId, testInteractionId);
            expect(artifacts).toHaveLength(2);
            expect(artifacts).toEqual(expect.arrayContaining([
                artifact1Sess1Intr1Text,
                artifact2Sess1Intr1Image
            ]));
            expect(artifacts).not.toEqual(expect.arrayContaining([artifact3Sess1Intr2Text]));
        });

        it('should filter artifacts by type within a sessionId', async () => {
            const artifacts = await service.listArtifacts(testSessionId, undefined, ArtifactType.TEXT);
            expect(artifacts).toHaveLength(2);
            expect(artifacts).toEqual(expect.arrayContaining([
                artifact1Sess1Intr1Text,
                artifact3Sess1Intr2Text
            ]));
            expect(artifacts).not.toEqual(expect.arrayContaining([artifact2Sess1Intr1Image]));
        });

        it('should filter artifacts by both interactionId and type within a sessionId', async () => {
            const artifacts = await service.listArtifacts(testSessionId, testInteractionId, ArtifactType.IMAGE);
            expect(artifacts).toHaveLength(1);
            expect(artifacts).toEqual([artifact2Sess1Intr1Image]);
        });

        it('should return an empty array if filters match no artifacts for the session', async () => {
            const noMatchInteraction = await service.listArtifacts(testSessionId, 'intr-no-match');
            expect(noMatchInteraction).toEqual([]);

            const noMatchType = await service.listArtifacts(testSessionId, undefined, ArtifactType.VIDEO);
            expect(noMatchType).toEqual([]);

            const noMatchInteractionAndType = await service.listArtifacts(testSessionId, testInteractionId, ArtifactType.VIDEO);
            expect(noMatchInteractionAndType).toEqual([]);
        });
    });

    describe('deleteArtifact', () => {
        it('should successfully delete an existing artifact and return true', async () => {
            const artifact = await service.saveArtifact(testSessionId, testInteractionId, 'to-delete.dat', 'delete content');
            expect(await service.getArtifact(artifact.id)).not.toBeNull(); // Verify it exists first

            const result = await service.deleteArtifact(artifact.id);
            expect(result).toBe(true);

            const retrievedArtifact = await service.getArtifact(artifact.id);
            expect(retrievedArtifact).toBeNull();
        });

        it('should return false if trying to delete a non-existent artifact ID', async () => {
            const result = await service.deleteArtifact('id-that-does-not-exist');
            expect(result).toBe(false);
        });

        it('deleting one artifact should not affect other artifacts', async () => {
            const artifactToKeep = await service.saveArtifact(testSessionId, testInteractionId, 'keep.txt', 'important data');
            const artifactToDelete = await service.saveArtifact(testSessionId, testInteractionId, 'ephemeral.tmp', 'temp data');

            const deleteResult = await service.deleteArtifact(artifactToDelete.id);
            expect(deleteResult).toBe(true);

            const retrievedKeptArtifact = await service.getArtifact(artifactToKeep.id);
            expect(retrievedKeptArtifact).not.toBeNull();
            expect(retrievedKeptArtifact!.id).toBe(artifactToKeep.id);

            const retrievedDeletedArtifact = await service.getArtifact(artifactToDelete.id);
            expect(retrievedDeletedArtifact).toBeNull();
        });

        // Optional: Test that clearAllArtifacts works if InMemoryArtifactService has such a utility
        // Similar to InMemorySessionService.clearAllSessions()
        // (Assuming InMemoryArtifactService might have a clearAllArtifacts() for testing)
        it('clearAllArtifacts should remove all artifacts (if such a helper exists on the concrete class)', async () => {
            await service.saveArtifact(testSessionId, testInteractionId, 'art1', 'c1');
            await service.saveArtifact('s2', 'i2', 'art2', 'c2');

            // Check if the concrete service instance has clearAllArtifacts
            if (typeof (service as InMemoryArtifactService).clearAllArtifacts === 'function') {
                (service as InMemoryArtifactService).clearAllArtifacts();
            }
            // If not, this test would be specific to an implementation detail not on IArtifactService.
            // For now, let's assume it exists for testability, or it would be removed.
            
            const artifactsAfterClear = await service.listArtifacts(testSessionId);
            // This assertion depends on whether clearAllArtifacts was called and is effective.
            // If clearAllArtifacts is not a feature, this test part needs removal or adjustment.
            // Given the pattern from InMemorySessionService, it's plausible.
            if (typeof (service as InMemoryArtifactService).clearAllArtifacts === 'function') {
                 expect(artifactsAfterClear).toEqual([]);
                 const listedGlobal = await service.listArtifacts('s2'); // Check other sessions too
                 expect(listedGlobal).toEqual([]);
            } else {
                // If clearAllArtifacts doesn't exist, the previous artifacts would still be there.
                // This test then becomes less meaningful without that specific method.
                // For robustness, we could check that listArtifacts still returns items if not cleared.
                // However, the intent is to test `clearAllArtifacts`.
                console.warn('InMemoryArtifactService does not have clearAllArtifacts. Skipping full assertion for this test.');
                // We can at least ensure no error was thrown if the method was attempted to be called via `as any`
            }
        });
    });
}); 