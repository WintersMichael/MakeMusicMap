function init() {
  var mapOptions = {
    center: new google.maps.LatLng(43.07, -89.4),
    zoom: 12,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };
  google.maps.visualRefresh = true;

  var map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

  var source = $("#performance-template").html();
  var template = Handlebars.compile(source);

  var md = new MapData();
  md.load('http://s3.amazonaws.com/makemusicmatch-dev/appdata/madison.json', function() {

    var venues = md.data;
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

          google.maps.event.addListener(marker, 'click', (function(venue) {
            return function() {
              var performances = venue.performances;
              $("#venue-name").html(venue.name);

              $("#performances-list").empty();
              for (var j = 0; j < performances.length; j++) {
                // Don't modify exisiting object
                var performance = jQuery.extend(true, {}, performances[j]);

                var dateTime = performance.start_time.split(" ");
                var time = dateTime[1].split(":");

                performance.start_time = time[0] + ":" + time[1];

                var html = template(performance);
                $("#performances-list").append(html);
              }
            }
          })(venue));
        }
      }
    }

    /*var results = md.search({
      'genre': 'Jazz'
    });*/
  });
}
$(document).ready(init);

function MapData() {

  //public properties

  this.data = []; //where we store search results


  //private properties

  var startTime, endTime; //for timing events
  var assocData; //the 'database' we search
  var onAjaxCompleteCallback; //optionally set when calling MapData.load()

  //public functions

  this.load = function load(url, successCallback, failCallback) {
    startTime = Date.now();
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
    startTime = Date.now();

    this.data = _.extend([], assocData); //copy data so caller can't modify our source data

    if (typeof(terms) === 'undefined') {
      //no search terms defined by caller
      return this.data;
    }


    if (typeof(terms.genre) != 'undefined') {
      this.data = filterGenre(this.data, terms.genre);
    }

    //keep passing this.data through other filter functions until final results are reached

    //alert("MapData.search() complete: " + (Date.now() - startTime) + "ms");
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
        })
        return v;
      })
      .filter(function(v) {
        //filter venues with no matching performances
        return v.performances.length > 0;
      })
      .value();
  }


  function onAjaxComplete(ajaxData) {
    //alert("MapData.load() ajax complete: " + (Date.now() - startTime) + "ms");
    startTime = Date.now();

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

    this.data = _.extend([], assocData); //copy data into public property so caller can't modify our source data

    //alert("MapData.load() assoc complete: " + (Date.now() - startTime) + "ms");

    if (typeof(onAjaxCompleteCallback) === 'function') {
      onAjaxCompleteCallback();
    }
  }
}
