/**
 * Rule the words! KKuTu Online
 * Copyright (C) 2017 JJoriping(op@jjo.kr)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

const MainDB	 = require("../db");
const JLog	 = require("../../sub/jjlog");
// const Ajae	 = require("../../sub/ajaejs").checkAjae;
const passport = require('passport');
const glob = require('glob-promise');
const GLOBAL	 = require("../../sub/global.json");
const config = require('../../sub/auth.json');
const path = require('path')
const usedGuestNicks = new Set();



function process(req, accessToken, MainDB, $p, done) {
    $p.token = accessToken;
    $p.sid = req.session.id;

    let now = Date.now();
    $p.sid = req.session.id;
    req.session.admin = GLOBAL.ADMIN.includes($p.id);

    req.session.authType = $p.authType;
    MainDB.session.upsert([ '_id', req.session.id ]).set({
        'profile': $p,
        'createdAt': now
    }).on();
    MainDB.users.findOne([ '_id', $p.id ]).on(($body) => {
        req.session.profile = $p;
        MainDB.users.update([ '_id', $p.id ]).set([ 'lastLogin', now ]).on();
    });

    done(null, $p);
}

exports.run = (Server, page) => {
    //passport configure
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((obj, done) => {
        done(null, obj);
    });

    const strategyList = {};
    
	for (let i in config) {

		if (i === 'guest') continue;

		try {
			let auth = require(path.resolve(__dirname, '..', 'auth', 'auth_' + i + '.js'))
			Server.get('/login/' + auth.config.vendor, passport.authenticate(auth.config.vendor))
			Server.get('/login/' + auth.config.vendor + '/callback', passport.authenticate(auth.config.vendor, {
				successRedirect: '/',
				failureRedirect: '/loginfail'
			}))
			passport.use(new auth.config.strategy(auth.strategyConfig, auth.strategy(process, MainDB /*, Ajae */)));
			strategyList[auth.config.vendor] = {
				vendor: auth.config.vendor,
				displayName: auth.config.displayName,
				color: auth.config.color,
				fontColor: auth.config.fontColor
			};

			JLog.info(`OAuth Strategy ${i} loaded successfully.`)
		} catch (error) {
			JLog.error(`OAuth Strategy ${i} is not loaded`)
			JLog.error(error.message)
		}
	}
	
Server.get("/login/guest/callback", (req, res) => {
    const nickRaw = req.query.nick || '';
    const nick = nickRaw.trim();

    // 1) 닉네임 기본 검증
    if (!nick) {
        return res.redirect("/login?desc=nonick");
    }
    if (nick.length < 2 || nick.length > 12) {
        return res.redirect("/login?desc=badnick");
    }
    // 필요하면 문자 제한도
    // if (!/^[가-힣a-zA-Z0-9]+$/u.test(nick)) {
    //     return res.redirect("/login?desc=badchar");
    // }

    // 2) 메모리에서 닉네임 중복 체크
    if (usedGuestNicks.has(nick)) {
        return res.redirect("/login?desc=이미 사용된 닉네임입니다.");
    }
    usedGuestNicks.add(nick);

    // 3) 게스트용 ID 생성
    const id = "guest_" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);

    // 4) process()가 쓰는 프로필 객체 만들기
    const $p = {
        authType: "guest",
        id: id,
        name: nick,
        title: nick,
        image: ""
    };

    // 5) 기존 로그인과 동일하게 세션/DB 처리
    process(req, null, MainDB, $p, (err) => {
        if (err) {
            JLog.error("Guest login process error: " + err.message);
            return res.redirect("/loginfail");
        }
        return res.redirect("/");
    });
});


	Server.get("/login", (req, res) => {
		if(global.isPublic){
			page(req, res, "login", { '_id': req.session.id, 'text': req.query.desc, 'loginList': strategyList});
		}else{
			let now = Date.now();
			let id = req.query.id || "ADMIN";
			let lp = {
				id: id,
				title: "LOCAL #" + id,
				birth: [ 4, 16, 0 ],
				_age: { min: 20, max: undefined }
			};
			MainDB.session.upsert([ '_id', req.session.id ]).set([ 'profile', JSON.stringify(lp) ], [ 'createdAt', now ]).on(function($res){
				MainDB.users.update([ '_id', id ]).set([ 'lastLogin', now ]).on();
				req.session.admin = true;
				req.session.profile = lp;
				res.redirect("/");
			});
		}
	});

	Server.get("/logout", (req, res) => {
		if(!req.session.profile){
			return res.redirect("/");
		} else {
			req.session.destroy();
			res.redirect('/');
		}
	});

	Server.get("/loginfail", (req, res) => {
		page(req, res, "loginfail");
	});
}