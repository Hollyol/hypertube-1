'use strict'

const https = require("https");
const request = require("request");

// Select functionning API
const selected_source = () => {
    return new Promise((resolve, reject) => {
        const sources = ["https://yst.am/api/v2", "https://yts.lt/api/v2"];
        let selectedSource = sources[1];
        https.get('https://yts.lt/api/v2/list_movies.json', (res) => {
            if (res.statusCode !== 200) {
                selectedSource = sources[0];
                resolve(selectedSource);
            } else {
                resolve(selectedSource)
            }
        });
    });
}


// const setMoviesInfo = (body) => {
//     const searchResults = body
//     if (searchResults.status === "ok" && searchResults.data.movie_count !== 0 && searchResults.data.movies) {
//         return Promise.all(
//             searchResults.data.movies.map(async movie => {
//                 const responseMovie = await Movie.findOne({ _ytsId: movie.id }).exec()
//                 if (responseMovie) {
//                     if (responseMovie && responseMovie.ratings.length > 0) {
//                     let count = 0;
//                     let total = 0;
//                     responseMovie.ratings.forEach(el => {
//                         total += el.rating;
//                         count++;
//                     });
//                     movie.ratingAverage = Math.floor((total / count) * 100) / 100
//                     movie.ratingCount = count
//                     }
//                 }
//             })
//         )
//     } else {
//         return false;
//     }
// }

// Search the API to return infos and the magnet
const get_magnet = async (movie_infos) => {
    return new Promise(async (resolve, reject) => {
        let selectedSource = await selected_source();
        // console.log(movie_infos.imdb_id);
        request.get({url: `${selectedSource}/list_movies.json?query_term=${movie_infos.imdb_id}&limit=1`}, async (err, results, body) => {
            if (err) {
                console.log('Error 1 : ' + err);
                resolve({ success: false });
            } else if (JSON.parse(body).status == 'ok') {
                // console.log(results);
                // console.log(JSON.parse(body).data.torrents[0]);
                const parseBody = JSON.parse(body.replace(/^\ufeff/g,""));
                if (parseBody && parseBody.data && parseBody.data.movies && parseBody.data.movies[0]) {
                    // let searchResults = await setMoviesInfo(parseBody)
                    console.log(parseBody.data.movies[0].torrents)
                    resolve(parseBody.data.movies[0].torrents)
                } else resolve({ success: false })
            } else {
                console.log('Error 2 : ' + err);
                resolve({ success: false });
            }
        })
        // const torrents = await TorrentSearchApi.search(movie_infos.title, 'Movies', 1)
        // resolve(torrents);
    });
}
module.exports.get_magnet = get_magnet;

/*

const films_db = require('../../model/films.js');
const TorrentSearchApi = require('torrent-search-api');
// const webtorrent = require('webtorrent');
const TORRENT_OPTIONS = {
    path: './views/public/torrents' // Folder to download files to (default=`/tmp/webtorrent/`)
}
// TorrentSearchApi.enableProvider('ThePirateBay');
// TorrentSearchApi.enableProvider('KickassTorrents');
// TorrentSearchApi.enableProvider('Torrent9');

// Enable provider
const enable_providers = async (source) => {
    let providers = '';
    return new Promise(async (resolve, reject) => {
        source.map(async (elem) => {
            // console.log('elem : ' + elem);
            TorrentSearchApi.enableProvider(elem);
            providers = await TorrentSearchApi.getActiveProviders();
        });
        resolve(providers);
    });
}
module.exports.enable_providers = enable_providers;

// Search the API to return infos and the magnet
const get_magnet = async (movie_infos) => {
    return new Promise(async (resolve, reject) => {
        const torrents = await TorrentSearchApi.search(movie_infos.title, 'Movies', 1)
        resolve(torrents);
    });
}
module.exports.get_magnet = get_magnet;

//
// const dowload_torrent = async (torrents, movie_infos) => {
//     if (torrents[0]) {
//         const magnet = await TorrentSearchApi.getMagnet(torrents[0]);
//         if (magnet) {
//             try {
//                 const webtorrent_client = new webtorrent();
//                 webtorrent_client.add(magnet, TORRENT_OPTIONS, function (torrent) {
//                     // Torrents can contain many files. Let's use the .mp4 file
//                     var file = torrent.files.find(function (file) {
//                         return file.name.endsWith('.mp4') || file.name.endsWith('.ogg') || file.name.endsWith('.webm') || file.name.endsWith('.mkv') || file.name.endsWith('.avi')
//                     });
//                     console.log(file);
//                     const extension_split = file.name.split('.');
//                     const extension = extension_split[extension_split.length - 1]
//                     const year = movie_infos.release_date.split('-')[0];
//                     films_db.add_torrent(movie_infos.id, file.path, extension, file.name, year, magnet);
//                     // A la fin du DL on update la db
//                     torrent.on('done', function () {
//                         console.log("*\/*\/ TORRENT DOWNLOAD COMPLETE \\*\\*");
//                         films_db.torrent_done(magnet);
//                     });
//                 });
//             } catch(err) { console.log('Error downloading the torrent : ' + err) }

//         } else {
//             console.log('ERROR ==> PAS DE MAGNET');
//         }
//     } else {
//         console.log('ERROR ==> PAS DE MAGNET');
//     }
// }

// const ft_torrent = async (movie_infos, source) => {
//     return new Promise(async (resolve, reject) => {
//         const providers = await enable_providers(source);
//         console.log('return de providers : ' + JSON.stringify(providers));
//         const torrents = await get_magnet(movie_infos);
//         // LIGNE A METTRE EN COMMENTAIRE POUR NE PAS DOWLOAD LE TORRENT
//         // =====> =====> =====>
//         dowload_torrent(torrents, movie_infos);
//         // <===== <===== <=====
//         resolve(torrents);
//     });
// }
// module.exports.ft_torrent = ft_torrent;


*/