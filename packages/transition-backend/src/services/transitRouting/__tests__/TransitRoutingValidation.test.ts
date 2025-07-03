/*
 * Copyright 2025, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import _cloneDeep from 'lodash/cloneDeep';
import { v4 as uuidV4 } from 'uuid';
import each from 'jest-each';
import { BaseOdTrip } from 'transition-common/lib/services/odTrip/BaseOdTrip';
import { TransitRoutingValidation, TransitValidationMessage } from '../TransitRoutingValidation';

import LineCollection from 'transition-common/lib/services/line/LineCollection';
import AgencyCollection from 'transition-common/lib/services/agency/AgencyCollection';
import ServiceCollection from 'transition-common/lib/services/service/ServiceCollection';
import Line from 'transition-common/lib/services/line/Line';
import Agency from 'transition-common/lib/services/agency/Agency';
import Service from 'transition-common/lib/services/service/Service';

import transitAgenciesDbQueries from '../../../models/db/transitAgencies.db.queries';
import transitServicesDbQueries from '../../../models/db/transitServices.db.queries';
import transitLinesDbQueries from '../../../models/db/transitLines.db.queries';
import schedulesDbQueries from '../../../models/db/transitSchedules.db.queries';

// Mock service collections
jest.mock('transition-common/lib/services/line/LineCollection');
jest.mock('transition-common/lib/services/agency/AgencyCollection');
jest.mock('transition-common/lib/services/service/ServiceCollection');

// Mock DB queries
jest.mock('../../../models/db/transitAgencies.db.queries', () => ({
    collection: jest.fn(),
}));
const mockDbAgencyCollection = transitAgenciesDbQueries.collection as jest.MockedFunction<typeof transitAgenciesDbQueries.collection>; 
jest.mock('../../../models/db/transitServices.db.queries', () => ({
    collection: jest.fn(),
}));
const mockDbServiceCollection = transitServicesDbQueries.collection as jest.MockedFunction<typeof transitServicesDbQueries.collection>; 
jest.mock('../../../models/db/transitLines.db.queries', () => ({
    collection: jest.fn(),
    collectionWithSchedules: jest.fn().mockImplementation((lines) => _cloneDeep(lines).map((line) => (line.scheduleByServiceId = {}, line))) // Default to empty services for lines
}));
const mockDbLineCollection = transitLinesDbQueries.collection as jest.MockedFunction<typeof transitLinesDbQueries.collection>; 
const mockDbLineCollectionWithSchedules = transitLinesDbQueries.collectionWithSchedules as jest.MockedFunction<typeof transitLinesDbQueries.collectionWithSchedules>; 
jest.mock('../../../models/db/transitSchedules.db.queries', () => ({
    getTripsInTimeRange: jest.fn().mockResolvedValue([]), // Default to empty trips
}));
const mockGetTripsInTimeRange = schedulesDbQueries.getTripsInTimeRange as jest.MockedFunction<typeof schedulesDbQueries.getTripsInTimeRange>;

const mockLineCollection = LineCollection as jest.MockedClass<typeof LineCollection>;
const mockAgencyCollection = AgencyCollection as jest.MockedClass<typeof AgencyCollection>;
const mockServiceCollection = ServiceCollection as jest.MockedClass<typeof ServiceCollection>;

describe('TransitRoutingValidation', () => {
    // Common test data
    const testDate = new Date(2023, 5, 15, 8, 0, 0); // Thursday June 15, 2023, 8:00 AM
    const baseOdTrip = new BaseOdTrip({
        id: uuidV4(),
        timeOfTrip: 8 * 3600, // 8:00 AM
        timeType: 'departure' as 'departure',
        origin_geography: { type: 'Point', coordinates: [-73.5, 45.5] },
        destination_geography: { type: 'Point', coordinates: [-73.6, 45.6] }
    });;

    const routingParams = {
        maxTotalTravelTimeSeconds: 90 * 60,
        maxAccessEgressTravelTimeSeconds: 15 * 60,
        maxTransferTravelTimeSeconds: 10 * 60,
        minWaitingTimeSeconds: 60,
        maxWaitingTimeSeconds: 20 * 60,
        bufferSeconds: 300
    };

    // Create test agencies
    const agency1Id = uuidV4();
    const agency2Id = uuidV4();
    const agency1 = new Agency({
        id: agency1Id,
        name: 'Agency1',
        shortname: 'A1',
        internal_id: 'A1'
    }, true);
    const agency2 = new Agency({
        id: agency2Id,
        name: 'Agency2',
        shortname: 'A2',
        internal_id: 'A2'
    }, true);

    // Create test lines
    const line1Id = uuidV4();
    const line2Id = uuidV4();
    const line1 = new Line({
        id: line1Id,
        agency_id: agency1Id,
        shortname: '1',
        longname: 'Line 1',
        is_enabled: true,
        mode: 'bus'
    }, true);
    const line2 = new Line({
        id: line2Id,
        agency_id: agency2Id,
        shortname: '2',
        longname: 'Line 2',
        is_enabled: true,
        mode: 'bus'
    }, true);

    // Create test services
    const service1Id = uuidV4();
    const service2Id = uuidV4();
    const service1 = new Service({
        id: service1Id,
        name: 'Service1',
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
        start_date: '2023-01-01',
        end_date: '2023-12-31',
        is_enabled: true
    }, true);
    const service2 = new Service({
        id: service2Id,
        name: 'Service2',
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: true,
        sunday: true,
        start_date: '2023-01-01',
        end_date: '2023-12-31',
        is_enabled: true
    }, true);

    beforeEach(() => {
        // Reset all mocks
        jest.resetAllMocks();

        // Mock collections
        mockLineCollection.prototype.getFeatures.mockReturnValue([line1, line2]);
        mockAgencyCollection.prototype.getByShortname.mockImplementation((shortname) => {
            if (shortname === 'A1') return agency1;
            if (shortname === 'A2') return agency2;
            return undefined;
        });
        mockServiceCollection.prototype.getById.mockImplementation((id) => {
            if (id === service1Id) return service1;
            if (id === service2Id) return service2;
            return undefined;
        });

        // Mock DB queries
        mockDbAgencyCollection.mockResolvedValue([agency1.attributes, agency2.attributes]);
        mockDbLineCollection.mockResolvedValue([line1.attributes, line2.attributes]);
        mockDbServiceCollection.mockResolvedValue([service1.attributes, service2.attributes]);
    });

    test('No lines in trip', async () => {
        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: []
        });

        // no declared trip message
        expect(result).toEqual({ type: 'noDeclaredTrip' });
    });

    test('One line not found', async () => {
        mockAgencyCollection.prototype.getByShortname.mockImplementation((shortname) => {
            if (shortname === 'A1') return agency1;
            return undefined;
        });
        
        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: [
                { line: '1', agency: 'A1' },
                { line: '3', agency: 'A3' }
            ]
        });

        expect(result).not.toBe(true);
        expect((result as TransitValidationMessage).type).toBe('lineNotFound');
        expect((result as any).line).toEqual([{ line: '3', agency: 'A3' }]);
    });

    test('Multiple lines not found', async () => {
        mockAgencyCollection.prototype.getByShortname.mockImplementation(() => undefined);
        
        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: [
                { line: '1', agency: 'A1' },
                { line: '2', agency: 'A2' }
            ]
        });

        expect(result).not.toBe(true);
        expect((result as TransitValidationMessage).type).toBe('lineNotFound');
        expect((result as any).line).toEqual([
            { line: '1', agency: 'A1' },
            { line: '2', agency: 'A2' }
        ]);
    });

    test('One line has no service', async () => {
        // Mock line collection with schedule data for collectionWithSchedules
        mockDbLineCollectionWithSchedules.mockResolvedValue([
            new Line({ ...line1.attributes, id: line1Id, scheduleByServiceId: {} }, false),
            new Line({ ...line2.attributes, id: line2Id, scheduleByServiceId: { [service1Id]: { service_id: service1Id } } }, false)
        ]);

        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: [
                { line: '1', agency: 'A1' },
                { line: '2', agency: 'A2' }
            ]
        });

        expect(result).not.toBe(true);
        expect((result as TransitValidationMessage).type).toBe('noServiceOnLine');
        expect((result as any).line).toEqual([{ line: '1', agency: 'A1' }]);
    });

    test('One line has no valid service on dates', async () => {
        // Mock line collection with schedule data for collectionWithSchedules
        // service 2 is weekend so should not be considered available on date
        mockDbLineCollectionWithSchedules.mockResolvedValue([
            new Line({ ...line1.attributes, id: line1Id, scheduleByServiceId: { [service2Id]: { service_id: service2Id } } }, false),
            new Line({ ...line2.attributes, id: line2Id, scheduleByServiceId: { [service1Id]: { service_id: service1Id } } }, false)
        ]);

        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: [
                { line: '1', agency: 'A1' },
                { line: '2', agency: 'A2' }
            ]
        });

        expect(result).not.toBe(true);
        expect((result as TransitValidationMessage).type).toBe('noServiceOnLine');
        expect((result as any).line).toEqual([{ line: '1', agency: 'A1' }]);

        expect(mockDbLineCollectionWithSchedules).toHaveBeenCalledWith([line1, line2]);
    });

    test('No service at time of trip', async () => {
        // Mock lines with services
        mockDbLineCollectionWithSchedules.mockResolvedValue([
            new Line({ ...line1.attributes, id: line1Id, scheduleByServiceId: { [service1Id]: { service_id: service1Id } } }, false),
        ]);
        
        // Mock empty trips for the time range
        mockGetTripsInTimeRange.mockResolvedValue([]);

        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: [{ line: '1', agency: 'A1' }]
        });

        expect(result).not.toBe(true);
        expect((result as TransitValidationMessage).type).toBe('noServiceOnLineAtTime');
        expect((result as any).line).toEqual([{ line: '1', agency: 'A1' }]);

        expect(mockDbLineCollectionWithSchedules).toHaveBeenCalledWith([line1]);
        expect(mockGetTripsInTimeRange).toHaveBeenCalledWith({
            rangeStart: baseOdTrip.attributes.timeOfTrip - routingParams.bufferSeconds,
            rangeEnd: baseOdTrip.attributes.timeOfTrip + routingParams.bufferSeconds + routingParams.maxTotalTravelTimeSeconds,
            lineIds: [line1Id],
            serviceIds: [service1Id]
        });
    });

    test('With trips available at time, validation passes', async () => {
        // Mock lines with services
        mockDbLineCollectionWithSchedules.mockResolvedValue([
            new Line({ ...line1.attributes, id: line1Id, scheduleByServiceId: { [service1Id]: { service_id: service1Id } } }, false),
        ]);
        
        // Mock trips available in the time range
        mockGetTripsInTimeRange.mockResolvedValue([
            {
                id: uuidV4(),
                schedule_period_id: 1,
                path_id: uuidV4(),
                departure_time_seconds: 8 * 3600,
                arrival_time_seconds: 9 * 3600,
                line_id: line1Id,
                service_id: service1Id,
            } as any
        ]);

        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: baseOdTrip,
            dateOfTrip: testDate,
            declaredTrip: [{ line: '1', agency: 'A1' }]
        });

        // With the current implementation, if trips are found, it should return true
        // (The full route validation isn't implemented yet)
        expect(result).toBe(true);

        expect(mockDbLineCollectionWithSchedules).toHaveBeenCalledWith([line1]);
        expect(mockGetTripsInTimeRange).toHaveBeenCalledWith({
            rangeStart: baseOdTrip.attributes.timeOfTrip - routingParams.bufferSeconds,
            rangeEnd: baseOdTrip.attributes.timeOfTrip + routingParams.bufferSeconds + routingParams.maxTotalTravelTimeSeconds,
            lineIds: [line1Id],
            serviceIds: [service1Id]
        });
    });

    test('With trips available at time, and timeType is arrival', async () => {
        // Mock lines with services
        mockDbLineCollectionWithSchedules.mockResolvedValue([
            new Line({ ...line1.attributes, id: line1Id, scheduleByServiceId: { [service1Id]: { service_id: service1Id } } }, false),
        ]);
        
        // Mock trips available in the time range
        mockGetTripsInTimeRange.mockResolvedValue([
            {
                id: uuidV4(),
                schedule_period_id: 1,
                path_id: uuidV4(),
                departure_time_seconds: 8 * 3600,
                arrival_time_seconds: 9 * 3600,
                line_id: line1Id,
                service_id: service1Id
            } as any
        ]);

        // Use an odTrip with arrival time type
        const odTripWithArrival = new BaseOdTrip(_cloneDeep(baseOdTrip.attributes), false);
        odTripWithArrival.attributes.timeType = 'arrival';
        const validation = new TransitRoutingValidation(routingParams);
        const result = await validation.run({
            odTrip: odTripWithArrival,
            dateOfTrip: testDate,
            declaredTrip: [{ line: '1', agency: 'A1' }]
        });

        // With the current implementation, if trips are found, it should return true
        // (The full route validation isn't implemented yet)
        expect(result).toBe(true);

        expect(mockDbLineCollectionWithSchedules).toHaveBeenCalledWith([line1]);
        expect(mockGetTripsInTimeRange).toHaveBeenCalledWith({
            rangeStart: baseOdTrip.attributes.timeOfTrip - routingParams.bufferSeconds - routingParams.maxTotalTravelTimeSeconds,
            rangeEnd: baseOdTrip.attributes.timeOfTrip + routingParams.bufferSeconds,
            lineIds: [line1Id],
            serviceIds: [service1Id]
        });
    });

    // The following tests are placeholders as they require additional implementation
    test.todo('One line, origin too far');
    test.todo('One line, destination too far');
    test.todo('Multiple lines, can route');
    test.todo('Multiple lines, origin too far');
    test.todo('Multiple lines, destination too far');
    test.todo('Multiple lines, junction too long');
    test.todo('Multiple lines, no transfer trip between 2 lines');
});