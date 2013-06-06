function MakeMusicMap() {
	var genres = [
		"Bluegrass",
		"Blues",
		"Cabaret",
		"Celtic",
		"Classical",
		"Country",
		"Electronic",
		"Experimental",
		"Folk",
		"Funk",
		"Gospel/Religious",
		"Gypsy",
		"Hip-Hop",
		"Indie-Folk",
		"Indie-Rock",
		"Irish",
		"Jazz",
		"Kids",
		"Latin",
		"Marching Band",
		"Opera",
		"Other",
		"Polka",
		"Pop",
		"R&B",
		"Reggae",
		"Rock",
		"Roots",
		"Soul",
		"Standards",
		"World"
	];

	var markerIconUrl = "http://mt.googleapis.com/vt/icon/name=icons/spotlight/spotlight-poi.png&scale=";

	var map = null;
	var mapData;
	var cities;
	var curCity;
	var perfTemplate;
	var markers = [];
	var selectedMarker;
	var filterOb = { "genre": null, "current": false, "time": null, "artist": "", "venue": "" }; // The current filter terms
	var keypressTimeoutObj;

	this.init = function() {
		var source = $("#performance-template").html();
		perfTemplate = Handlebars.compile(source);

		$.ajax({
			url: "http://s3.amazonaws.com/appdata2013/cities.json",
			dataType: "json",
			context: this,
			success: onCitiesLoaded,
			error: function(jqxhr, textStatus, errorThrown) {
				alert('Error retrieving city data: ' + textStatus + ' ' + errorThrown);
			}
		});

	};

	function onCitiesLoaded(data) {
		cities = data;

		var cityId = 0;
		var queryString = window.location.search;
		if (queryString != "")
			cityId = parseInt(queryString.split("=")[1], 10);

		changeCity(cityId);
	}


	function changeCity(id) {
		curCity = _.find(cities, function(c) {
			return c.id == id;
		});
		mapData = new MapData();
		mapData.load(curCity.performances, onMapDataLoaded);

		$("#city-logo").attr("src", curCity.logo);
	}


	function onMapDataLoaded() {
		showMap();
		populateMap();
		activateUI();

		$("#loading").hide()
	}


	function showMap() {
		var mapOptions = {
			zoom: curCity.webzoom,
			mapTypeId: google.maps.MapTypeId.ROADMAP
		};
		google.maps.visualRefresh = true;

		if (map === null) {
			map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);
		}

		map.setCenter(new google.maps.LatLng(curCity.lat, curCity.lng));

		google.maps.event.addListener(map, 'click', function() {
			deselectVenue();
		});
	}


	function activateUI() {
		_.each(genres, function(g) {
			$("#genre-filter").append("<option value=\"" + g + "\">" + g + "</option>");
		});

		$("#genre-filter").change(function(e) {
			var genre = $(e.target).val();
			filterOb.genre = genre == "" ? null : genre;

			mapData.search(filterOb);

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

			mapData.search(filterOb);

			deselectVenue();
			clearMarkers();
			populateMap();
		});

		$("#current").change(function(e) {
			var selected = $(e.target).prop('checked');

			if (selected) {
				filterOb.current = true;
				$("#time-filter").attr("disabled", "disabled");
			} else {
				filterOb.current = false;
				$("#time-filter").removeAttr("disabled");
			}

			mapData.search(filterOb);

			deselectVenue();
			clearMarkers();
			populateMap();
		});

		$("#artistname-filter").keyup(function(e) {
			clearTimeout(keypressTimeoutObj);
			keypressTimeoutObj = setTimeout(
				function() {
					filterOb.artist = $(e.target).val();

					mapData.search(filterOb);

					deselectVenue();
					clearMarkers();
					populateMap();
				},
				200
			);
		});

		$("#venuename-filter").keyup(function(e) {
			clearTimeout(keypressTimeoutObj);
			keypressTimeoutObj = setTimeout(
				function() {
					filterOb.venue = $(e.target).val();

					mapData.search(filterOb);

					deselectVenue();
					clearMarkers();
					populateMap();
				},
				200
			);
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
		$("#instructions").hide();

		marker.setIcon(markerIconUrl + "1.5");
		marker.setZIndex(9999);
		selectedMarker = marker;

		$("#venue-name").html(venue.name);
		$("#venue-address").html(venue.address);

		var performances = _.sortBy(venue.performances, function(p) {
			var timeOb = parseTime(p.start_time);
			return timeOb.hour24 + timeOb.minute / 60;
		});

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

		$(".artist-image-link").fancybox();
	}


	function deselectVenue() {
		if (typeof selectedMarker !== "undefined") {
			selectedMarker.setIcon(markerIconUrl + "1");
			selectedMarker.setZIndex();
		}

		$("#performances-list").empty();
		$("#venue-name").empty();
		$("#venue-address").empty();

		$("#instructions").show();
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
		$.ajax({
			dataType: "json",
			url: url,
			success: onAjaxComplete,
			context: this
		});
	}

	this.search = function search(terms) {
		/*
			Search the dataset, and both return the results and set them as the publicly-available
			property this.data.

			search({
				"genre": "Jazz",
				"current": false,
				"time": null,
				"artist": "Miles",
				"venue": "blue"
			});
		*/

		this.data = $.extend(true, [], assocData); //copy data so caller can't modify our source data

		if (terms.genre !== null && terms.genre !== '') {
			this.data = filterGenre(this.data, terms.genre);
		}

		if (terms.current) {
			this.data = filterNow(this.data);
		} else if (terms.time !== null) {
			this.data = filterTime(this.data, terms.time);
		}

		if (terms.artist !== null && terms.artist !== '') {
			this.data = filterArtistName(this.data, terms.artist);
		}

		if (terms.venue !== null && terms.venue !== '') {
			this.data = filterVenueName(this.data, terms.venue);
		}

		return this.data;
	};


	//private functions

	function filterGenre(venues, genre) {
		var gSearch = new RegExp(genre);

		return filter(venues, function(p) {
			return p.artist.genres.match(gSearch);
		});
	}

	// Pass in 24-hour time. Filters by performance time intersection with hour
	// to hour + 1.
	function filterTime(venues, hour) {
		return filter(venues, function(p) {
			startTimeOb = parseTime(p.start_time);
			endTimeOb = parseTime(p.end_time);

			return (startTimeOb.hour24 < hour && (endTimeOb.hour24 > hour || endTimeOb.hour24 == hour && endTimeOb.minute > 0)) ||
				(startTimeOb.hour24 == hour);
		});
	}

	// Filter by currently performing
	function filterNow(venues, hour, minute) {
		var now = new Date();
		if (now.getMonth() != 5 || now.getDate() != 21) {
			return [];
		}

		var hour = now.getHours();
		var minute = now.getMinutes();

		return filter(venues, function(p) {
			startTimeOb = parseTime(p.start_time);
			endTimeOb = parseTime(p.end_time);

			return (hour == startTimeOb.hour24 && minute >= startTimeOb.minute || hour > startTimeOb.hour24) &&
				(hour == endTimeOb.hour24 && minute <= endTimeOb.minute     || hour < endTimeOb.hour24);
		});
	}

	function filterArtistName(venues, name) {
		var aSearch = new RegExp(name, 'i');

		return filter(venues, function(p) {
			return p.artist.groupname.match(aSearch);
		});
	}

	function filterVenueName(venues, name) {
		var vSearch = new RegExp(name, 'i');

		return _.filter(venues, function(v) {
			return v.name.match(vSearch);
		});
	}

	function filter(venues, filterFunc) {
		return _.chain(venues)
			.map(function(v) {
				v.performances = _.filter(v.performances, filterFunc);
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
