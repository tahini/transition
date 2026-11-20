/*
 * Copyright Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */

import { v4 as uuidV4 } from 'uuid';
import Path, { type PathAttributes } from 'transition-common/lib/services/path/Path';
import type {
    PathGeojsonProperties,
    PathQueryFilter,
    PathSummaryData
} from 'transition-common/lib/services/path/IPathRepository';
import pathsDbQueries from '../../../../models/db/transitPaths.db.queries';
import BackendPathRepository from '../BackendPathRepository';

jest.mock('../../../../models/db/transitPaths.db.queries', () => ({
    __esModule: true,
    default: {
        read: jest.fn(),
        readObjects: jest.fn(),
        summaries: jest.fn(),
        geojsonCollectionNew: jest.fn()
    }
}));

const mockRead = jest.mocked(pathsDbQueries.read);
const mockReadObjects = jest.mocked(pathsDbQueries.readObjects);
const mockSummaries = jest.mocked(pathsDbQueries.summaries);
const mockGeojsonCollectionNew = jest.mocked(pathsDbQueries.geojsonCollectionNew);

const getPathAttributes = (): PathAttributes =>
    ({
        id: uuidV4(),
        name: 'Test path',
        direction: 'outbound',
        line_id: uuidV4(),
        is_enabled: true,
        is_frozen: false,
        nodes: [uuidV4(), uuidV4()],
        stops: [],
        segments: [],
        mode: 'bus',
        geography: {
            type: 'LineString',
            coordinates: [
                [-73, 45],
                [-73.001, 45.001]
            ]
        },
        data: {
            nodeTypes: ['engine', 'engine'],
            waypoints: [],
            waypointTypes: [],
            variables: { n_q_p: 2 }
        }
    }) as PathAttributes;

describe('BackendPathRepository', () => {
    const repository = new BackendPathRepository();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('gets and constructs a complete Path', async () => {
        const attributes = getPathAttributes();
        mockRead.mockResolvedValue(attributes);

        const path = await repository.get(attributes.id);

        expect(mockRead).toHaveBeenCalledWith(attributes.id);
        expect(path).toBeInstanceOf(Path);
        expect(path.getId()).toBe(attributes.id);
    });

    test('gets summarized path data with the requested filter', async () => {
        const filter: PathQueryFilter = { agencyIds: [uuidV4()] };
        const summaries: PathSummaryData[] = [
            {
                id: uuidV4(),
                lineId: uuidV4(),
                direction: 'outbound',
                name: 'Summary path',
                mode: 'bus',
                color: '#ffffff',
                nodeCount: 3
            }
        ];
        mockSummaries.mockResolvedValue(summaries);

        await expect(repository.getSummaries(filter)).resolves.toEqual(summaries);
        expect(mockSummaries).toHaveBeenCalledWith(filter);
    });

    test('gets and constructs complete Paths with the requested filter', async () => {
        const filter: PathQueryFilter = { pathIds: [uuidV4()] };
        const attributes = [getPathAttributes(), getPathAttributes()];
        mockReadObjects.mockResolvedValue(attributes);

        const paths = await repository.getObjects(filter);

        expect(mockReadObjects).toHaveBeenCalledWith(filter);
        expect(paths).toHaveLength(2);
        expect(paths.every((path) => path instanceof Path)).toBe(true);
        expect(paths.map((path) => path.getId())).toEqual(attributes.map(({ id }) => id));
    });

    test('gets GeoJSON with the repository property shape', async () => {
        const attributes = getPathAttributes();
        const featureCollection: GeoJSON.FeatureCollection<GeoJSON.LineString, PathGeojsonProperties> = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    id: 1,
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [-73, 45],
                            [-73.001, 45.001]
                        ]
                    },
                    properties: {
                        id: attributes.id,
                        mode: attributes.mode,
                        lineId: attributes.line_id,
                        direction: attributes.direction,
                        name: attributes.name,
                        color: '#ffffff',
                        agencyAcronym: 'test'
                    }
                }
            ]
        };
        mockGeojsonCollectionNew.mockResolvedValue(featureCollection);

        const result = await repository.getGeojsonCollection();

        expect(mockGeojsonCollectionNew).toHaveBeenCalledWith();
        expect(result).toEqual(featureCollection);
    });
});
