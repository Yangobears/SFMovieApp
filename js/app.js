// Init work.
// Firebase Config
var config = {
    apiKey: "AIzaSyDfTS8Ahh2LVuWtPP-SgTxxrhSgK-lIaRs",
    authDomain: "sfmovieapp.firebaseapp.com",
    databaseURL: "https://sfmovieapp.firebaseio.com",
    storageBucket: "bucket.appspot.com",
    // messagingSenderId: "1098510713899",
};
// Initialize Firebase and set reference for db, movies, locations.
firebase.initializeApp(config);
var db = firebase.database();
var ref = db.ref();
// ref.remove(); // For testing.
var moviesRef = ref.child("movies");
var locationsRef = ref.child("locations");

// Models
// Movie model that stores movie details and the locations id list.
function Movie(data) {
    var self = this;
    self.title = data.title;
    self.locations = data.locations;
    self.director = data.director;
    self.release_year = data.release_year;
    self.posterUrl = data.posterUrl;
    self.backDropUrl = data.backDropUrl;
    self.overview = data.overview;
    self.vote = data.vote;
}

//Location model that stores marker, infoWindow, funfacts, name of the location.
function Location(data, movie) {
    var self = this;
    self.name = data.name;
    self.fun_facts = data.fun_facts;
    self.latlng = data.latlng;
    self.marker = new google.maps.Marker({
        position: self.latlng,
        title: self.name
    });
    // Matching with the search bar.
    self.matching = ko.observable(true);
    var openWindow = function() {
        if (!self.infowindow) {
            self.infowindow = new google.maps.InfoWindow();
            var contentString = '<div class="location-infowindow">';
            contentString += '<p> Movie: ' + movie.title + '</p>';
            var streetViewUrl = "https://maps.googleapis.com/maps/api/streetview?size=150x75&location=" +
                self.latlng.lat + ',' + self.latlng.lng;
            contentString += '<img src=' + streetViewUrl + ' class="streetView"  alt="google street view" >';
            contentString += '<p> Location: ' + self.name + '</p>';
            if (self.fun_facts != null) {
                contentString += '<br>Fun Facts:<p>' + self.fun_facts + '</p><br></div>';
            }
            self.infowindow.setContent(contentString);
        }
        self.infowindow.open(map, self.marker);
        // Close the other opened window or bouncing markers.
        if (viewModel.lastOpenedWindow != null) {
            viewModel.lastOpenedWindow.close();
        }
        if (viewModel.lastBounceMarker != null) {
            viewModel.lastBounceMarker.setAnimation(null);
        }
        self.marker.setAnimation(google.maps.Animation.BOUNCE);
        viewModel.lastOpenedWindow = self.infowindow;
        viewModel.lastBounceMarker = self.marker;
        // Bounce the marker for a second.
        setTimeout(function() {
            self.marker.setAnimation(null)
        }, 1000);
    };

    // Hide marker.
    self.hide = function() {
        self.marker.setMap(null);
    }

    // Show marker.
    self.show = function() {
        self.marker.setMap(map);
    }

    //Update matching boolean and update marker accordingly.
    self.update = function(matched) {
      self.matching(matched);
      if (matched) {
          self.show();
      } else {
          self.hide();
      }
    }

    // Push to location lists.
    viewModel.selectedLocations.push(self);

    // When marker is clicked. show openWindow.
    self.marker.addListener('click', openWindow);
    self.marker.addListener('mousedown', openWindow);
}

// AJAX calls
// Querying SF open data if the movie name has not been queried/ not in the list
function querySF(movieList) {
    var self = this;
    self.queryByTitle = function(title) {
        $.ajax({
            url: "https://data.sfgov.org/resource/wwmu-gmzc.json",
            type: "GET",
            data: {
                "$limit": 50,
                "$$app_token": "k2UF9FelmewqoXDpYxFJrdNeQ",
                "title": title
            },
            success: self.success,
            error: self.failure
        });
    }

    // Create new movie which includes all locations
    self.success = function(data) {
        if (data.length > 0) {
            // The way json is returned, all fields are same besides locations
            var curr = data[0];
            var movie = {
                title: curr.title,
                // A list of locationIds refer to where the movie is filmed.
                locations: [],
                director: curr.director,
                release_year: curr.release_year
            };
            for (var i = 0; i < data.length; i++) {
                var locationName = data[i].locations;
                var fun_facts = null;
                if (data[i].fun_facts) {
                    fun_facts = data[i].fun_facts;
                }
                var newLocation = {
                    name: locationName,
                    fun_facts: fun_facts
                };
                //  Save location to db
                var newLocRef = locationsRef.push(newLocation);
                getGeoCode(locationName + ",San Francisco, CA", newLocRef);
                // Get the unique key generated
                var locationId = newLocRef.key;
                //  Relate location key to the movie for later retrival
                movie.locations.push({
                    locId: locationId
                });
            }
            // Save movie to db
            var newMovieRef = moviesRef.push(movie);
            // Call movie api to get movie info
            getMovieInfo(curr.title, newMovieRef);

        } else {
            console.log('Not Found');
            viewModel.noMatching(true);
        }
    }
    self.failure = function() {
        viewModel.errAPICalling(true);
        console.log('Blew up.');
    }
}

// Call movie db api to get infomation and update the movie object in firebase.
function getMovieInfo(movieTitle, ref) {
    $.ajax({
        url: "https://api.themoviedb.org/3/search/movie",
        type: "GET",
        data: {
            "$limit": 1,
            "api_key": "bdadc1817e54bd454aa8b6f1060c5f1d",
            "language": "en-US",
            "query": movieTitle,
            "page": 1
        },
        success: function(data) {
            if (data.results.length > 0) {
                var result = data.results[0];
                var purl = null;
                if (result.poster_path != null) {
                    purl = "https://image.tmdb.org/t/p/w154" + result.poster_path;
                }
                var burl = null;
                if (result.backdrop_path != null) {
                    burl = "https://image.tmdb.org/t/p/w300" + result.backdrop_path;
                }
                ref.update({
                    posterUrl: purl,
                    backDropUrl: burl,
                    overview: result.overview,
                    vote: result.vote_average
                });
                // Add movie to the knockout movie array.
                ref.on("value", function(snapshot) {
                    addMovie(snapshot);
                });

            }
        },
        error: function() {
            viewModel.errAPICalling(true);
            console.log("Movie info failed to retrived ");
        }
    });
}

// Call google geo api to get lat long for location name
function getGeoCode(locationName, ref) {
    $.ajax({
        url: "https://maps.googleapis.com/maps/api/geocode/json?key=AIzaSyC8lPBKS3A8cDVC2PVYMDfUCpTN-meole0",
        type: "GET",
        data: {
            "address": locationName
        },
        success: function(data) {
            if (data.results.length > 0) {
                ref.update({
                    latlng: data.results[0].geometry.location
                });
            }
        },
        error: function() {
            console.log("google geo fail");
        }
    });
}

// View
function appViewModel() {
    var self = this;
    self.searchedMovie = ko.observable();
    self.searchedLocation = ko.observable();
    self.showList = ko.observable(true);
    self.noMatching = ko.observable(false);
    self.movies = ko.observableArray([]);
    self.selectedLocations = ko.observableArray([]);
    self.lastOpenedWindow = null;
    self.lastBounceMarker = null;
    self.errAPICalling = ko.observable(false);
    self.selectedMovieId = ko.observable();
    querySF = new querySF(this.movies);

    // Call SF open data to retrieve info
    self.searchForMovie = function() {
        self.showList(true);
        querySF.queryByTitle(self.searchedMovie);
    }

    // Toggle the list
    self.toggle = function() {
        self.showList(!self.showList());
    };

    // Filter all movies by the movie user searched
    self.filteredMovies = ko.computed(function() {
        self.noMatching(false);
        self.showList(true);
        if (!self.searchedMovie()) {
            return self.movies();
        } else {
            return ko.utils.arrayFilter(self.movies(), function(movie) {
                return movie.title.toLowerCase().indexOf(self.searchedMovie().toLowerCase()) >= 0;
            });
        }
    });

    // Update the filtered locations by the loaction user searched
    self.filteredLocations = ko.computed(function() {
        self.noMatching(false);
        self.showList(true);
        if (!self.searchedLocation()) {
            self.selectedLocations().forEach(function(location) {
                location.update(true);
            });
            return self.selectedLocations();
        } else {
            return ko.utils.arrayFilter(self.selectedLocations(), function(location) {
                if (location.name.toLowerCase().indexOf(self.searchedLocation().toLowerCase()) >= 0) {
                    location.update(true);
                } else {
                    location.update(false);
                }
            });
        }
    });

    // Show all locations.
    self.goToMovie = function(movie) {
        // Hide all locations from the previous movie.
        if (self.selectedLocations().length > 0) {
            self.selectedLocations().forEach(function(location) {
                location.update(false);
            })
        }
        self.selectedLocations.removeAll();
        self.selectedMovieId(movie);
        // Make all locations assocaited with the movie show up.
        var locIds = movie.locations;
        for (var i = 0; i < locIds.length; i++) {
            var locId = locIds[i].locId;
            var locRef = new firebase.database().ref('locations/' + locId);
            locRef.on("value", function(snapshot) {
                addLocation(snapshot, movie);
            });
        }
        if (self.selectedLocations.length > 0) {
            map.setCenter(self.selectedLocations[0].latlng);
        }
    };

}

// When page first load, firebase movies add to knockout movie list.
moviesRef.once("value", function(snapshot) {
    snapshot.forEach(
        addMovie)
});

// Instantiate viewModel
viewModel = new appViewModel();

// Add movie to viewModel.
function addMovie(data) {
    var val = data.val();
    viewModel.movies.push(new Movie(val));
}

// Add Locaitons marker google map.
function addLocation(data, movie) {
    var val = data.val();
    var locationObj = new Location(val, movie);
    locationObj.show();
}

// Google map init, set satellite view as default.
initMap = function() {
    sfLatLng = {
        lat: 37.773972,
        lng: -122.431297
    };
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: sfLatLng,
        mapTypeId: 'satellite'
    });
    google.maps.event.addDomListener(window, "resize", function() {
        var center = map.getCenter();
        google.maps.event.trigger(map, "resize");
        map.setCenter(center);
    });
    ko.applyBindings(viewModel);
}

// For responsive folding menu.
$(document).ready(function() {
    $("#menu").click(function() {
        $(".search-panel").slideToggle("slow");
    });
});
