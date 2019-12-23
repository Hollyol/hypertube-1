'use strict'

const torrentStream = require('torrent-stream');
const with_auth = require('./user/authentification_middleware');
const http = require("http")
const fs = require("fs");
const express = require('express');
const router = express.Router();
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
    console.log('\x1b[31m%s\x1b[0m', '-> OpenSubtitles connection error');
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

/*
    If the movie is already downloaded, send it by chunks
    Else download it and in the same time pipe it to the frontend
*/
router.get('/movie_player', async (req, res) => {
    if (req.query && req.query.moviedb_id && req.query.moviedb_id != '') {
        let movie_infos_api = await movie_model.movie_infos(req.query.moviedb_id);
        if (movie_infos_api.status_code == 34) {
            console.log('The movie could not be found');
            res.sendStatus(404);
        } else if (movie_infos_api && movie_infos_api.id == req.query.moviedb_id) {
            const providers = await torrent.enable_providers(['Rarbg', 'Torrentz2', 'ThePirateBay', 'KickassTorrents', 'TorrentProject']);
            const torrents = await torrent.get_magnet(movie_infos_api);
            if (torrents && torrents[0] && torrents[0].magnet && torrents[0] !== undefined) {
                const engine = torrentStream(torrents[0].magnet, { path: "./views/public/torrents" })
                engine.on("ready", () => {
                    engine.files.forEach((file) => {
                        if (path.extname(file.name) === ".mp4" || path.extname(file.name) === ".mkv" || path.extname(file.name) === ".avi" ) {
                            if (fs.existsSync(`./views/public/torrents/${file.path}`)) {
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
                                            var stream = fs.createReadStream(`./views/public/torrents/${file.path}`, { start, end })
                                            .on("open", function() {
                                                stream.pipe(res);
                                            }).on("error", function(err) {
                                                res.end(err);
                                            })
                                        }
                                    }
                                })
                            } else {
                                const extension_split = file.name.split('.');
                                const extension = extension_split[extension_split.length - 1]
                                const year = movie_infos_api.release_date.split('-')[0];
                                movie_model.add_torrent(movie_infos_api.id, file.path, extension, file.name, year, torrents[0].magnet);
                                console.log("DANS LE ELSE");
                                const fileStream = file.createReadStream()
                                fileStream.pipe(res)
                            }
                        }
                    })
                })
            }
        }
    }
})
module.exports = router;
