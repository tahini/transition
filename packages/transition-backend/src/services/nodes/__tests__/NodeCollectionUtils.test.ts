/*
 * Copyright 2022, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import { EventManagerMock, TestUtils, RoutingServiceManagerMock } from 'chaire-lib-common/lib/test';
import events from 'events';
import { v4 as uuidV4 } from 'uuid';
import { NodeAttributes } from 'transition-common/lib/services/nodes/Node';
import NodeCollection from 'transition-common/lib/services/nodes/NodeCollection';
import * as NodeCollectionUtils from '../NodeCollectionUtils';
import { objectToCache } from '../../../models/capnpCache/transitNodes.cache.queries';
import { getTransferableNodes } from '../TransferableNodeUtils';
import transferableNodesDbQueries from '../../../models/db/transitNodeTransferable.db.queries';
import nodesDbQueries from '../../../models/db/transitNodes.db.queries';

// Mock DB queries about transferable nodes
jest.mock('../../../models/db/transitNodeTransferable.db.queries', () => ({
    getFromNode: jest.fn(),
    saveForNode: jest.fn()
}));
const mockGetTransferableNodesFrom = transferableNodesDbQueries.getFromNode as jest.MockedFunction<typeof transferableNodesDbQueries.getFromNode>;

jest.mock('../TransferableNodeUtils', () => ({
    getTransferableNodes: jest.fn()
}));
const mockGetTransferableNodes = getTransferableNodes as jest.MockedFunction<typeof getTransferableNodes>;

jest.mock('../../../models/capnpCache/transitNodes.cache.queries', () => {
    return {
        objectToCache: jest.fn()
    };
});
const mockedObjectToCache = objectToCache as jest.MockedFunction<typeof objectToCache>;

jest.mock('../../../models/db/transitNodes.db.queries', () => {
    return {
        getNodesInBirdDistance: jest.fn(),
        getNodesInBirdDistanceFromPoint: jest.fn()
    }
});
const mockedGetNodesInBirdDistance = nodesDbQueries.getNodesInBirdDistance as jest.MockedFunction<typeof nodesDbQueries.getNodesInBirdDistance>;
const mockedGetNodesInBirdDistanceFromPoint = nodesDbQueries.getNodesInBirdDistanceFromPoint as jest.MockedFunction<typeof nodesDbQueries.getNodesInBirdDistanceFromPoint>;

const eventEmitter = new events.EventEmitter();
const eventManager = EventManagerMock.eventManagerMock;
const mockTableFrom = RoutingServiceManagerMock.routingServiceManagerMock.getRoutingServiceForEngine('engine').tableFrom;
// Actual response does not matter for this test, just return 0s for every destination
mockTableFrom.mockImplementation(async (params) => ({ query: '', durations: params.destinations.map((d) => 0), distances: params.destinations.map((d) => 0) }));

const commonProperties = {
    is_enabled: true,
    routing_radius_meters: 20,
    default_dwell_time_seconds: 20,
    is_frozen: false,
    data: { }
};

// 4 nodes: 3 within 1km distance, one beyond

const nodeAttributesClose1 = {
    id: uuidV4(),
    integer_id: 1,
    name: 'Node1',
    geography: { type: 'Point' as const, coordinates: [-73.62508177757263, 45.53720431516967] as [number, number] },
    code: 'nodeCode',
    ...commonProperties
};

const nodeAttributesClose2 = {
    id: uuidV4(),
    integer_id: 2,
    name: 'Node2',
    geography: { type: 'Point' as const, coordinates: [-73.62407326698303, 45.53891770223567] as [number, number] },
    code: 'nodeCode2',
    ...commonProperties
};

const nodeAttributesClose3 = {
    id: uuidV4(),
    integer_id: 3,
    name: 'Node3',
    geography: { type: 'Point' as const, coordinates: [-73.62024307250977, 45.537828054224086] as [number, number] },
    code: 'nodeCode3',
    ...commonProperties
};

const nodeAttributesFar = {
    id: uuidV4(),
    integer_id: 4,
    name: 'Node4',
    geography: { type: 'Point' as const, coordinates: [-73.61251831054688, 45.52475063103143] as [number, number] },
    code: 'nodeCode4',
    ...commonProperties
};

const nodeClose1Geojson = TestUtils.makePoint(nodeAttributesClose1.geography.coordinates, nodeAttributesClose1) as GeoJSON.Feature<GeoJSON.Point, NodeAttributes>;
const nodeClose2Geojson = TestUtils.makePoint(nodeAttributesClose2.geography.coordinates, nodeAttributesClose2) as GeoJSON.Feature<GeoJSON.Point, NodeAttributes>;
const nodeClose3Geojson = TestUtils.makePoint(nodeAttributesClose3.geography.coordinates, nodeAttributesClose3) as GeoJSON.Feature<GeoJSON.Point, NodeAttributes>;
const nodeFarGeojson = TestUtils.makePoint(nodeAttributesFar.geography.coordinates, nodeAttributesFar) as GeoJSON.Feature<GeoJSON.Point, NodeAttributes>;

let nodeCollection: NodeCollection;

beforeEach(() => {
    nodeCollection = new NodeCollection([nodeClose1Geojson, nodeClose2Geojson, nodeClose3Geojson, nodeFarGeojson], {}, eventManager);
    jest.clearAllMocks()
});

describe('Saving nodes to cache', () => {

    // Mock the transferable nodes for each node
    const node1TransferableNodes = {
        nodesIds: [nodeAttributesClose1.id, nodeAttributesClose2.id, nodeAttributesClose3.id],
        walkingTravelTimesSeconds: [0, 150, 550],
        walkingDistancesMeters: [0, 120, 512]
    };
    const node2TransferableNodes = {
        nodesIds: [nodeAttributesClose2.id, nodeAttributesClose1.id, nodeAttributesClose3.id],
        walkingTravelTimesSeconds: [0, 150, 300],
        walkingDistancesMeters: [0, 120, 250]
    };
    const node3TransferableNodes = {
        nodesIds: [nodeAttributesClose3.id],
        walkingTravelTimesSeconds: [0],
        walkingDistancesMeters: [0]
    };
    const nodeFarTransferableNodes = {
        nodesIds: [nodeAttributesFar.id],
        walkingTravelTimesSeconds: [0],
        walkingDistancesMeters: [0]
    };

    test('saveAndUpdateAllNodes without collection manager', async() => {
    
        mockGetTransferableNodes.mockResolvedValueOnce(node1TransferableNodes);
        mockGetTransferableNodes.mockResolvedValueOnce(node2TransferableNodes);
        mockGetTransferableNodes.mockResolvedValueOnce(node3TransferableNodes);
        mockGetTransferableNodes.mockResolvedValueOnce(nodeFarTransferableNodes);
        await NodeCollectionUtils.saveAndUpdateAllNodes(nodeCollection, undefined, eventEmitter);
    
        // Make sure all save calls to object to cache were done correctly
        expect(mockGetTransferableNodes).toHaveBeenCalledTimes(4);
        expect(mockedObjectToCache).toHaveBeenCalledTimes(4);
        // Make sure nodes have been updated
        const savedObject1 = mockedObjectToCache.mock.calls[0][0];
        const savedObject2 = mockedObjectToCache.mock.calls[1][0];
        const savedObject3 = mockedObjectToCache.mock.calls[2][0];
        const savedObject4 = mockedObjectToCache.mock.calls[3][0];
        // Validate transferable node data was successfully saved
        expect(savedObject1.getId()).toEqual(nodeAttributesClose1.id);
        expect(savedObject1.getData('transferableNodes')).toEqual(node1TransferableNodes);
        expect(savedObject2.getId()).toEqual(nodeAttributesClose2.id);
        expect(savedObject2.getData('transferableNodes')).toEqual(node2TransferableNodes);
        expect(savedObject3.getId()).toEqual(nodeAttributesClose3.id);
        expect(savedObject3.getData('transferableNodes')).toEqual(node3TransferableNodes);
        expect(savedObject4.getId()).toEqual(nodeAttributesFar.id);
        expect(savedObject4.getData('transferableNodes')).toEqual(nodeFarTransferableNodes);
    });
    
    test('saveAllNodesToCache without collection manager (no transferable node calculation)', async() => {
        mockGetTransferableNodesFrom.mockResolvedValueOnce(node1TransferableNodes);
        mockGetTransferableNodesFrom.mockResolvedValueOnce(node2TransferableNodes);
        mockGetTransferableNodesFrom.mockResolvedValueOnce(node3TransferableNodes);
        mockGetTransferableNodesFrom.mockResolvedValueOnce(nodeFarTransferableNodes);
    
        await NodeCollectionUtils.saveAllNodesToCache(nodeCollection);
    
        // Make sure all save calls to object to cache were done correctly
        expect(mockGetTransferableNodesFrom).toHaveBeenCalledTimes(4);
        expect(mockedObjectToCache).toHaveBeenCalledTimes(4);
        // Make sure nodes have been updated
        const savedObject1 = mockedObjectToCache.mock.calls[0][0];
        const savedObject2 = mockedObjectToCache.mock.calls[1][0];
        const savedObject3 = mockedObjectToCache.mock.calls[2][0];
        const savedObject4 = mockedObjectToCache.mock.calls[3][0];
        // Validate transferable node data was successfully saved
        expect(savedObject1.getId()).toEqual(nodeAttributesClose1.id);
        expect(savedObject1.getData('transferableNodes')).toEqual(node1TransferableNodes);
        expect(savedObject2.getId()).toEqual(nodeAttributesClose2.id);
        expect(savedObject2.getData('transferableNodes')).toEqual(node2TransferableNodes);
        expect(savedObject3.getId()).toEqual(nodeAttributesClose3.id);
        expect(savedObject3.getData('transferableNodes')).toEqual(node3TransferableNodes);
        expect(savedObject4.getId()).toEqual(nodeAttributesFar.id);
        expect(savedObject4.getData('transferableNodes')).toEqual(nodeFarTransferableNodes);
    });

});

describe('getNodesInBirdDistance', () => {
    test('no data', async () => {
        mockedGetNodesInBirdDistance.mockResolvedValueOnce([]);
        const distance = 1000;
        const nodesInBirdDistance = await NodeCollectionUtils.getNodesInBirdDistance(nodeAttributesClose1.id, distance);
        expect(nodesInBirdDistance).toEqual([]);
        expect(mockedGetNodesInBirdDistance).toHaveBeenCalledWith(nodeAttributesClose1.id, distance);
    });

    test('some nodes returned, not including requested one', async () => {
        mockedGetNodesInBirdDistance.mockResolvedValueOnce([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        const distance = 1000;
        const nodesInBirdDistance = await NodeCollectionUtils.getNodesInBirdDistance(nodeAttributesClose1.id, distance);
        expect(nodesInBirdDistance).toEqual([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        expect(mockedGetNodesInBirdDistance).toHaveBeenCalledWith(nodeAttributesClose1.id, distance);
    });

    test('some nodes returned, including requested one', async () => {
        mockedGetNodesInBirdDistance.mockResolvedValueOnce([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        const distance = 1000;
        const nodesInBirdDistance = await NodeCollectionUtils.getNodesInBirdDistance(nodeAttributesClose1.id, distance);
        expect(nodesInBirdDistance).toEqual([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        expect(mockedGetNodesInBirdDistance).toHaveBeenCalledWith(nodeAttributesClose1.id, distance);
    });
});

describe('getNodesInBirdDistanceFromPoint', () => {
    const point = nodeAttributesClose1.geography;

    test('no data', async () => {
        mockedGetNodesInBirdDistanceFromPoint.mockResolvedValueOnce([]);
        const distance = 1000;
        const nodesInBirdDistance = await NodeCollectionUtils.getNodesInBirdDistanceFromPoint(point, distance);
        expect(nodesInBirdDistance).toEqual([]);
        expect(mockedGetNodesInBirdDistanceFromPoint).toHaveBeenCalledWith(point, distance);
    });

    test('some nodes returned, not including requested one', async () => {
        mockedGetNodesInBirdDistanceFromPoint.mockResolvedValueOnce([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        const distance = 1000;
        const nodesInBirdDistance = await NodeCollectionUtils.getNodesInBirdDistanceFromPoint(point, distance);
        expect(nodesInBirdDistance).toEqual([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        expect(mockedGetNodesInBirdDistanceFromPoint).toHaveBeenCalledWith(point, distance);
    });

    test('some nodes returned, including requested one', async () => {
        mockedGetNodesInBirdDistanceFromPoint.mockResolvedValueOnce([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        const distance = 1000;
        const nodesInBirdDistance = await NodeCollectionUtils.getNodesInBirdDistanceFromPoint(point, distance);
        expect(nodesInBirdDistance).toEqual([
            { id: nodeAttributesClose1.id, distance: 300 }, 
            { id: nodeAttributesClose2.id, distance: 700 }
        ]);
        expect(mockedGetNodesInBirdDistanceFromPoint).toHaveBeenCalledWith(point, distance);
    });
});
