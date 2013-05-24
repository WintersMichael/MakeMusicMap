function MakeMusicMap() {
  var genres = [
    "Classical",
    "Electronic",
    "Experimental",
    "Gospel/Religious",
    "Hip-Hop",
    "Jazz",
    "Kids",
    "Other",
    "Pop",
    "R&B",
    "Rock",
    "Standards"
  ];

  var markerIconUrl = "http://mt.googleapis.com/vt/icon/name=icons/spotlight/spotlight-poi.png&scale=";


  var map;
  var mapData;
  var perfTemplate;
  var markers = [];
  var selectedMarker;
  var filterOb = { "genre": null, "time": null }; // The current filter terms

  this.init = function() {
    _.each(genres, function(g) {
      $("#genre-filter").append("<option value=\"" + g + "\">" + g + "</option>");
    });
    $("#genre-filter").change(function(e) {
      var genre = $(e.target).val();
      filterOb.genre = genre == "" ? null : genre;

      var results = mapData.search(filterOb);

      deselectVenue();
      clearMarkers();
      populateMap();
    });

    for (var i = 0; i < 12; i++) {
      var from = 10 + i;
      var until = from + 1;

      fromOb = hour24to12(from);
      untilOb = hour24to12(until);

      $("#time-filter").append("<option value=\"" + from + "\">" +
          fromOb.hour + fromOb.suffix + " - " + untilOb.hour + untilOb.suffix + "</option>");
    }
    $("#time-filter").change(function(e) {
      var time = $(e.target).val();
      filterOb.time = time == "" ? null : parseInt(time, 10);

      var results = mapData.search(filterOb);

      deselectVenue();
      clearMarkers();
      populateMap();
    });

    initMap();

    var source = $("#performance-template").html();
    perfTemplate = Handlebars.compile(source);

    var cityId = parseInt(window.location.search.split("=")[1], 10);
    $.ajax({
      url: "/cities.json",
      dataType: "json",
      success: function(data) {
        var city = _.find(data, function(c) {
          return c.id == cityId;
        });
        mapData = new MapData();
        mapData.load(city.performances, populateMap);

        map.setCenter(new google.maps.LatLng(city.lat, city.lng));
      },
      error: function(xhr, textStatus, error) {
        console.log(textStatus);
      }
    });
  }

  function initMap() {
    var mapOptions = {
      zoom: 10,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    };
    google.maps.visualRefresh = true;

    map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

    google.maps.event.addListener(map, 'click', function() {
      deselectVenue();
    });
  }

  function populateMap() {
    var venues = mapData.data;
    for (var i = 0; i < venues.length; i++) {
      var venue = venues[i];

      if (venue.performances.length != 0) {
        // TODO: handle venues with address but no lat lng
        if (venue.lat && venue.lng) {
          var position = new google.maps.LatLng(venue.lat, venue.lng);

          var marker = new google.maps.Marker({
            position: position,
            map: map,
            title: venue.name
          });

          markers.push(marker);

          google.maps.event.addListener(marker, 'click',
            (function(venue, marker) {
              return function() {
                selectVenue(venue, marker)
              }
            })(venue, marker));

          google.maps.event.addListener(marker, 'dblclick',
            (function(marker) {
              return function() {
                map.setCenter(marker.getPosition());
                map.setZoom(map.getZoom() + 1);
              }
            })(marker));
        }
      }
    }
  }

  function selectVenue(venue, marker) {
    deselectVenue();

    marker.setIcon(markerIconUrl + "1.5");
    marker.setZIndex(9999);
    selectedMarker = marker;

    var performances = venue.performances;
    $("#venue-name").html(venue.name);

    $("#performances-list").empty();
    for (var j = 0; j < performances.length; j++) {
      // Don't modify exisiting object
      var performance = $.extend({}, performances[j]);

      var startTimeOb = parseTime(performance.start_time);
      var endTimeOb = parseTime(performance.end_time);

      performance.start_time = timeObToString(startTimeOb);
      performance.end_time = timeObToString(endTimeOb);

      var html = perfTemplate(performance);
      $("#performances-list").append(html);
    }
  }

  function deselectVenue() {
    if (typeof selectedMarker !== "undefined") {
      selectedMarker.setIcon(markerIconUrl + "1");
      selectedMarker.setZIndex();
    }

    $("#performances-list").empty();
    $("#venue-name").empty();
  }

  function clearMarkers() {
    _.each(markers, function(m) {
      m.setMap(null);
    });
    markers = [];
  }
}


function MapData() {

  //public properties

  this.data = []; //where we store search results


  //private properties

  var assocData; //the 'database' we search
  var onAjaxCompleteCallback; //optionally set when calling MapData.load()

  //public functions

  this.load = function load(url, successCallback, failCallback) {
    if (typeof(successCallback) === 'function') {
      onAjaxCompleteCallback = successCallback;
    }
    if (typeof(failCallback) === 'function') {
      onAjaxFailCallback = failCallback;
    }
    var that = this;
    $.ajax({
      dataType: "json",
      url: url,
      success: onAjaxComplete,
      context: this
    });
  }

  this.search = function search(terms) {
    /*
      Will search the dataset and both return the results and set them as the publicly-available
      property this.data.

      Example:

      search({
        'genre': 'Jazz',

      }};
    */

    this.data = $.extend(true, [], assocData); //copy data so caller can't modify our source data

    if (terms.genre != null) {
      this.data = filterGenre(this.data, terms.genre);
    }

    if (terms.time != null) {
      this.data = filterTime(this.data, terms.time);
    }

    return this.data;
  }


  //private functions

  function filterGenre(venues, genre) {
    return _.chain(venues)
      .map(function(v) {
        var gSearch = new RegExp(genre);
        //filter venue performances by artist genre
        v.performances = _.filter(v.performances, function(p) {
          return p.artist.genres.match(gSearch);
        });
        return v;
      })
      .filter(function(v) {
        //filter venues with no matching performances
        return v.performances.length > 0;
      })
      .value();
  }

  // Pass in 24-hour time. Filters by performance time intersection with hour
  // to hour + 1.
  function filterTime(venues, hour) {
    return _.chain(venues)
      .map(function(v) {
        v.performances = _.filter(v.performances, function(p) {
          startTimeOb = parseTime(p.start_time);
          endTimeOb = parseTime(p.end_time);

          return (startTimeOb.hour24 < hour && (endTimeOb.hour24 > hour || endTimeOb.hour24 == hour && endTimeOb.minute > 0)) ||
                 (startTimeOb.hour24 == hour);
        });
        return v;
      })
      .filter(function(v) {
        //filter venues with no matching performances
        return v.performances.length > 0;
      })
      .value();
  }


  function onAjaxComplete(ajaxData) {
    //associate the data.
    assocData = [];
    for (var v = 0; v < ajaxData.venues.length; v++) {
      //venue
      assocData.push(ajaxData.venues[v]);
      //venue.performances
      assocData[v].performances = _.filter(ajaxData.performances, function(p) {
        return p.venue_id == assocData[v].id;
      });
      // console.log(JSON.stringify(assocData[v].performances));
      for (var p = 0; p < assocData[v].performances.length; p++) {
        //venue.performances.artist
        assocData[v].performances[p].artist = _.filter(ajaxData.artists, function(a) {
          return a.id == assocData[v].performances[p].artist_id;
        })[0];
      }
    }

    this.data = $.extend(true, [], assocData); //copy data into public property so caller can't modify our source data

    if (typeof(onAjaxCompleteCallback) === 'function') {
      onAjaxCompleteCallback();
    }
  }
}


// Parse time in format "... HH:MM:SS" into { hour, minute, suffix }
function parseTime(str) {
  var time = str.split(" ")[1];
  var hms = _.map(time.split(":"), function(s) { return parseInt(s, 10); });
  var hour12ob = hour24to12(hms[0]);

  return { "hour24": hms[0], "hour12": hour12ob.hour, "minute": hms[1], "suffix": hour12ob.suffix };
}

// Convert timeOb produced by parseTime into a string
function timeObToString(timeOb) {
  return timeOb.hour12 + ":" +
         (timeOb.minute < 10 ? "0" + timeOb.minute : timeOb.minute) +
         timeOb.suffix;
}

function hour24to12(hour24) {
  var hour12 = hour24 > 12 ? hour24 - 12 : hour24;
  var suffix = hour24 < 12 ? "AM" : "PM";

  return { "hour": hour12, "suffix": suffix };
}


var mmm = new MakeMusicMap();
$(document).ready(mmm.init);
