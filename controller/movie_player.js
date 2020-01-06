'use strict'

const torrentStream = require('torrent-stream');
const with_auth = require('./user/authentification_middleware');
const http = require("http")
const fs = require("fs");
const express = require('express');
const router = express.Router();
var ffmpeg = require('fluent-ffmpeg');
var command = ffmpeg();
const OpenSubtitles = require("opensubtitles-api")
const OS = new OpenSubtitles({
  useragent: "TemporaryUserAgent",
  username: 'hypertube_92',
  password: 'hypertube',
  ssl: false,
})

const movie_model = require('../model/films.js');
const torrent = require('./torrent/torrent.js');
const path = require("path");

OS.login()
.then((res) => {
    console.log('\x1b[36m%s\x1b[0m', '-> OpenSubtitles connection established');
})
.catch((error) => {
    console.log('\x1b[31m%s\x1b[0m', '-> OpenSubtitles connection error', error);
});

/*
    Get subtitles
*/
const getSubtitles = async(imdbid, langs) => {
    try {
        const response = await OS.search({ imdbid, sublanguageid: langs.join(), limit: 'best' })
        return Promise.all(
            Object.entries(response).map(async(entry) => {
                const langCode = entry[0]
                return new Promise ((resolve, reject) => {
                    let req = http.get(entry[1].vtt)
                    req.on("response", (res) => {
                        const file = fs.createWriteStream(`./views/public/subtitles/${imdbid}_${langCode}`)
                        const stream = res.pipe(file)
                        stream.on('finish', () => {
                            fs.readFile(`./views/public/subtitles/${imdbid}_${langCode}`, "utf8", (err, content) => {
                                if (!err) {
                                    const buffer = Buffer.from(content);
                                    resolve({ key: langCode, value: buffer.toString("base64") })
                                }
                            })
                        })
                    })
                    req.on("error", error => {
                        reject(error)
                    })
                })
            })
        )
    } catch (err) {
        console.log('Error in getting the subtitles : ' + err);
    }
}

router.get('/subtitles', async (req, res) => {
    if (req.query && req.query.imdb_id && req.query.imdb_id != '') {
        const langs = ["fre", "eng"];
        try {
            const response = await getSubtitles(req.query.imdb_id, langs)
            let subtitles = {}
            if (response) {
                response.forEach((subtitle) => {
                    subtitles = {
                        ...subtitles,
                        [subtitle.key]: subtitle.value,
                    }
                })
            }
            res.json({ subtitles })
        } catch (error) {
            res.json({ error })
        }
    }
});

// const convert = function (file, thread) {
//     console.log('IN CONVERT')
//     if (!thread)
//       thread = 8
//     console.log('Start converting file...')
//     return new ffmpeg(file.createReadStream())
//       .videoCodec('libvpx')
//       .audioCodec('libvorbis')
//       .format('webm')
//       .audioBitrate(128)
//       .videoBitrate(1024)
//       .outputOptions([
//         '-threads ' + thread,
//         '-deadline realtime',
//         '-error-resilient 1'
//       ])
//       .on('end', function () {
//         console.log('File is now webm !')
//       })
//       .on('error', function (err) {
//       })
// }

/*
    If the movie is already downloaded, send it by chunks
    Else download it and in the same time pipe it to the frontend
*/
router.get('/movie_player', async (req, res) => {
    if (req.query && req.query.moviedb_id && req.query.moviedb_id != '') {
        let movie_infos_api = await movie_model.movie_infos(req.query.moviedb_id);
        console.log(movie_infos_api)
        if (movie_infos_api.status_code == 34) {
            console.log('The movie could not be found');
            res.sendStatus(404);
        } else if (movie_infos_api && movie_infos_api.id == req.query.moviedb_id) {
            // const providers = await torrent.enable_providers(['Rarbg', 'Torrentz2', 'ThePirateBay', 'KickassTorrents', 'TorrentProject']);
            const torrents = await torrent.get_magnet(movie_infos_api);
            console.log(torrents)
            if (torrents && torrents.success && torrents.success === false) {
                console.log('PAS DE MAGNET');
                res.sendStatus(404);
            } else if (torrents && torrents[0] && torrents[0] !== undefined && torrents[0].url) {
                console.log(torrents[0].url)
                let torrent_magnet = `magnet:?xt=urn:btih:${torrents[0].hash}&dn=${encodeURI(movie_infos_api.original_title)}&tr=http://track.one:1234/announce&tr=udp://track.two:80`;
                console.log(torrent_magnet)
                const engine = torrentStream(torrent_magnet, { path: "./views/public/torrents" })
                engine.on("ready", () => {
                    engine.files.forEach((file) => {
                        if (path.extname(file.name) === ".mp4" || path.extname(file.name) === ".mkv" || path.extname(file.name) === ".avi" ) {
                            if (fs.existsSync(`./views/public/torrents/${file.path}`)) {
                                console.log('PAS DANS LE ELSE')
                                fs.stat(`./views/public/torrents/${file.path}`, function(err, stats) {
                                    if (err) {
                                        if (err.code === 'ENOENT') {
                                          // 404 Error if file not found
                                          return res.sendStatus(404);
                                        }
                                        res.end(err);
                                    } else {
                                        let range = req.headers.range;
                                        if (!range) {
                                            // 416 Wrong range
                                            return res.sendStatus(416);
                                        } else {
                                            console.log('LA')
                                            const positions = range.replace(/bytes=/, "").split("-");
                                            let start = parseInt(positions[0], 10);
                                            const total = stats.size;
                                            const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
                                            if (start >= end)
                                                start = end
                                            const chunksize = (end - start) + 1;
                                            res.writeHead(206, {
                                                "Content-Range": "bytes " + start + "-" + end + "/" + total,
                                                "Accept-Ranges": "bytes",
                                                "Content-Length": chunksize,
                                                "Content-Type": "video/mp4"
                                            })
                                            let extension1 = file.path.split('.');
                                            let extension2 = extension1[extension1.length - 1];
                                            console.log(extension2)
                                            let stream = {}
                                            // if (extension2 == 'mp4' || extension2 == 'webm') {
                                                stream = fs.createReadStream(`./views/public/torrents/${file.path}`, { start, end })
                                                .on("open", function() {
                                                    console.log('dans open')
                                                    // ffmpeg(`./views/public/torrents/${file.path}`, { start, end }).format('mp4')
                                                    // You may pass a pipe() options object when using a stream
                                                    //   .output(stream, { end:true });
                                                    stream.pipe(res);
                                                }).on("error", function(err) {
                                                    res.end(err);
                                                })
                                                console.log('mp4 = ' + extension2)
                                            // }
                                            // else {
                                            //     stream = fs.createReadStream(`./views/public/torrents/${file.path}`, { start, end })
                                            //     // var stream = (extension2 == 'mp4' || extension2 == 'webm') ? fs.createReadStream(`./views/public/torrents/${file.path}`, { start, end }) : convert(`./views/public/torrents/${file.path}`, { start, end })
                                            //     .on("open", function() {
                                            //         console.log('dans open')
                                            //         // ffmpeg(`./views/public/torrents/${file.path}`, { start, end }).format('mp4')
                                            //         // You may pass a pipe() options object when using a stream
                                            //         //   .output(stream, { end:true });
                                            //         stream.pipe(res);
                                            //     }).on("error", function(err) {
                                            //         res.end(err);
                                            //     })
                                            // }
                                        }
                                    }
                                })
                            } else {
                                const extension_split = file.name.split('.');
                                const extension = extension_split[extension_split.length - 1]
                                const year = movie_infos_api.release_date.split('-')[0];
                                movie_model.add_torrent(movie_infos_api.id, file.path, extension, file.name, year, torrents[0].url);
                                console.log("DANS LE ELSE");
                                const fileStream = file.createReadStream()
                                    
                                fileStream.pipe(res)
                            }
                        }
                    })
                })
            } else {
                console.log('PAS DE TORRENT');
                res.sendStatus(404)
            }
        }
    }
})

/*
    MOVIE_ADVANCEMENT: sent every minute to update the viewer's advancement
*/
router.post('/movie_advancement', with_auth, async (req, res) => {
    movie_model.update_time_viewed(req.uuid, req.body.imdb_ID, req.body.duration, req.body.current_time)
})


module.exports = router;