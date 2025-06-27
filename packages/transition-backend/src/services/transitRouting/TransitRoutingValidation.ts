/*
 * Copyright 2025, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */

import { TransitRoutingBaseAttributes } from 'chaire-lib-common/lib/services/routing/types';
import { BaseOdTrip } from 'transition-common/lib/services/odTrip/BaseOdTrip';
import transitLinesDbQueries from '../../models/db/transitLines.db.queries';
import LineCollection from 'transition-common/lib/services/line/LineCollection';
import AgencyCollection from 'transition-common/lib/services/agency/AgencyCollection';
import transitAgenciesDbQueries from '../../models/db/transitAgencies.db.queries';
import Line from 'transition-common/lib/services/line/Line';
import ServiceCollection from 'transition-common/lib/services/service/ServiceCollection';
import transitServicesDbQueries from '../../models/db/transitServices.db.queries';

type DeclaredLine = { line: string; agency: string };

export type TransitValidationMessage =
    | {
          type: 'lineNotFound';
          line: DeclaredLine[];
      }
    | {
          type: 'noServiceOnLine';
          line: DeclaredLine[];
      }
    | {
          type: 'noServiceOnLineAtTime';
          line: DeclaredLine[];
      }
    | {
          type: 'walkingDistanceTooLong';
          origin: 'origin' | DeclaredLine;
          destination: 'destination' | DeclaredLine;
          distance: number;
      }
    | {
          type: 'incompatibleTrip';
      };

export type TransitValidationAttributes = TransitRoutingBaseAttributes & {
    bufferSeconds?: number; // Buffer time to subtract to the trip departure time or add to the arrival time
};

export class TransitRoutingValidation {
    private _lineCollection: LineCollection | undefined = undefined;
    private _agencyCollection: AgencyCollection | undefined = undefined;
    private _serviceCollection: ServiceCollection | undefined = undefined;

    constructor(private routingParameters: TransitValidationAttributes) {
        // Nothing else to do
    }

    private prepareData = async () => {
        if (this._lineCollection && this._agencyCollection && this._serviceCollection) {
            // Data already prepared
            return;
        }

        const lineCollection = new LineCollection([], {});
        const lines = await transitLinesDbQueries.collection();
        lineCollection.loadFromCollection(lines);
        this._lineCollection = lineCollection;

        const agencyCollection = new AgencyCollection([], {});
        const agencies = await transitAgenciesDbQueries.collection();
        agencyCollection.loadFromCollection(agencies);
        this._agencyCollection = agencyCollection;

        const serviceCollection = new ServiceCollection([], {});
        const services = await transitServicesDbQueries.collection();
        serviceCollection.loadFromCollection(services);
        this._serviceCollection = serviceCollection;
    };

    run = async ({
        odTrip,
        dateOfTrip,
        declaredTrip
    }: {
        odTrip: BaseOdTrip;
        dateOfTrip: Date;
        declaredTrip: DeclaredLine[];
    }): Promise<true | TransitValidationMessage> => {
        await this.prepareData();

        // Identify the lines use by the declared trip
        const declaredTransitLines: { line?: Line; declaredLine: DeclaredLine }[] = declaredTrip.map((declaredLine) => {
            const agencyId = this._agencyCollection!.getByShortname(declaredLine.agency)?.id;
            if (!agencyId) {
                return { declaredLine };
            }
            const line = this._lineCollection!.getFeatures().find(
                (line) => line.attributes.agency_id === agencyId && line.attributes.shortname === declaredLine.line
            );
            return { declaredLine, line };
        });

        // If not all lines are found, return with a lineNotFound message
        const linesNotFound = declaredTransitLines.filter((declaredLine) => !declaredLine.line);
        if (linesNotFound.length > 0) {
            return {
                type: 'lineNotFound',
                line: linesNotFound.map((declaredLine) => declaredLine.declaredLine)
            };
        }

        // For each line, get the services at the given date
        const linesUsed = declaredTransitLines.map((declaredLine) => declaredLine.line!);
        const linesWithSchedules = await transitLinesDbQueries.collectionWithSchedules(linesUsed);
        const linesWithFilteredServices = linesWithSchedules.map((line, idx) => {
            const schedulesByServiceId = line.attributes.scheduleByServiceId || {};
            const services = Object.entries(schedulesByServiceId).filter(([serviceId, _schedule]) => {
                const service = this._serviceCollection!.getById(serviceId);
                if (!service) {
                    return false;
                }
                // Check if the service is active on the date of the trip
                return service.isValidForDate(dateOfTrip);
            });
            const validServices = services.map(([serviceId, schedule]) => schedule);
            return { line, validServices, declaredLine: declaredTransitLines[idx].declaredLine };
        });

        // If any line has not service, return with a noServiceOnLine message
        const linesWithoutService = linesWithFilteredServices.filter(
            (line) => Object.keys(line.validServices).length === 0
        );
        if (linesWithoutService.length > 0) {
            return {
                type: 'noServiceOnLine',
                line: linesWithoutService.map((line) => line.declaredLine)
            };
        }

        // Get all the trips for each line within the time period of the trip
        const timeRangeStart =
            odTrip.attributes.timeOfTrip -
            (this.routingParameters.bufferSeconds || 0) -
            (odTrip.attributes.timeType === 'departure'
                ? 0
                : this.routingParameters.maxTotalTravelTimeSeconds || 180 * 60);
        const timeRangeEnd =
            timeRangeStart +
            (this.routingParameters.bufferSeconds || 0) * 2 +
            (odTrip.attributes.timeType === 'departure'
                ? 0
                : this.routingParameters.maxTotalTravelTimeSeconds || 180 * 60);

        // Are there trips for each line? If not, return with a noServiceOnLineAtTime message
        const linesWithTrips = linesWithFilteredServices.map((lineWithTrip) => {
            lineWithTrip.validServices.map((schedule) => {});
        });

        // Get the paths for each trip in time range

        // [For each combination of lines entered]
        // Get the nearest entry node to the origin in the first line
        // Get the nearest exit node to the destination in the last line
        // Get nearest entry/exit node pairs for each transfer lines
        // Calculate walking distances. Are they plausible? If not, return with a 'walkingDistanceTooLong' message

        // Verify if the service is compatible with the declared trip
        // Set prevArrivalTime to the time of departure - buffer
        // For each line
        // Find trip such that departureTime >= prevArrivalTime + walkingDistanceToEntryNode
        // If no trip found, return with a noServiceOnLineAtLine message
        // Set prevArrivalTime to the stop time at exit node of trip_i
        // Trip found, return true

        return true;
    };
}
