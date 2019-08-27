const moment = require('moment');

module.exports = (bookingRepository, intervalRepository, placeTypeRepository, placeExtraRepository) => ({
  getPlaceFreeSpots: async (place, date) => {
    // join intervals and bookings
    const books = await bookingRepository.findAllWhere({ place: place._id, closed: false });
    place.bookings = books;
    const interval = await intervalRepository.findOneWhere({ place: place._id });
    if (!interval) {
      return 0;
    }
    place.intervals = interval.intervals;
  
    const relevantBookings = place.bookings.filter(booking => booking.date === date);
    const relevantDay = moment(date, 'DD-MM-YYYY').format('dddd');
    const slotsTotal = place.intervals
      .filter(interval => interval.day === relevantDay)
      .reduce((acc, interval) => acc + interval.slots, 0);
  
    return slotsTotal - relevantBookings.length;
  },

  getPlaceIcons: async (place) => {
    const placeImages = {};
    const placeType = await placeTypeRepository.findOne(place.type);
    if (placeType) {
      placeImages.typology = [placeType.image];
    }
    if (place.extra) {
      const extras = await Promise.all(
        place.extra.map(async (extra) => placeExtraRepository.findOne(extra)),
      );
      const extrasImages = extras.filter(e => e).map(extra => extra.image);
      placeImages.extras = extrasImages;
    }

    return placeImages;
  },
});
