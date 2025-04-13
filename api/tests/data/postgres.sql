DROP TABLE IF EXISTS hero_builds;

create table hero_builds
(
    hero             integer           not null,
    build_id         integer           not null,
    version          integer           not null,
    author_id        integer,
    favorites        integer default 0 not null,
    ignores          integer default 0 not null,
    reports          integer default 0 not null,
    updated_at       timestamp,
    data             jsonb,
    language         integer,
    weekly_favorites integer default 0 not null,
    rollup_category  integer,
    primary key (hero, build_id, version)
);

INSERT INTO hero_builds (hero, build_id, version, author_id, favorites, ignores, reports, updated_at, data, language,
                         weekly_favorites, rollup_category)
VALUES (7, 15583, 14, 68693421, 29868, 0, 0, '2024-12-07 09:14:36.000000', '{
  "hero_build": {
    "name": "Linepro Wraith",
    "details": {
      "ability_order": {
        "currency_changes": [
          {
            "delta": -1,
            "ability_id": 1999680326,
            "currency_type": 2
          },
          {
            "delta": -1,
            "ability_id": 1842576017,
            "currency_type": 2
          },
          {
            "delta": -1,
            "ability_id": 1999680326,
            "currency_type": 1
          },
          {
            "delta": -1,
            "ability_id": 4147641675,
            "currency_type": 2
          },
          {
            "delta": -1,
            "ability_id": 2981692841,
            "currency_type": 2
          },
          {
            "delta": -2,
            "ability_id": 1999680326,
            "currency_type": 1
          },
          {
            "delta": -1,
            "ability_id": 1842576017,
            "currency_type": 1
          },
          {
            "delta": -2,
            "ability_id": 1842576017,
            "currency_type": 1
          },
          {
            "delta": -1,
            "ability_id": 2981692841,
            "currency_type": 1
          },
          {
            "delta": -1,
            "ability_id": 4147641675,
            "currency_type": 1
          },
          {
            "delta": -2,
            "ability_id": 4147641675,
            "currency_type": 1
          },
          {
            "delta": -5,
            "ability_id": 4147641675,
            "currency_type": 1
          },
          {
            "delta": -5,
            "ability_id": 1842576017,
            "currency_type": 1
          },
          {
            "delta": -2,
            "ability_id": 2981692841,
            "currency_type": 1
          },
          {
            "delta": -5,
            "ability_id": 2981692841,
            "currency_type": 1
          },
          {
            "delta": -5,
            "ability_id": 1999680326,
            "currency_type": 1
          }
        ]
      },
      "mod_categories": [
        {
          "mods": [
            {
              "ability_id": 2010028405
            },
            {
              "ability_id": 1548066885
            },
            {
              "ability_id": 668299740
            },
            {
              "ability_id": 3399065363
            },
            {
              "ability_id": 3776945997
            },
            {
              "ability_id": 381961617
            },
            {
              "ability_id": 3633614685
            }
          ],
          "name": "Lane Phase",
          "width": 775.0,
          "height": 163.0,
          "description": "Skill Unlock: 1-3-2-4 | Skill Upgrade:  1-1-3-3-4-2-2-2-3-4-4-1 twitch.tv/linepro"
        },
        {
          "mods": [
            {
              "ability_id": 1710079648
            },
            {
              "ability_id": 1009965641
            }
          ],
          "name": "Optional",
          "width": 245.0,
          "height": 148.0,
          "description": "If losing lane"
        },
        {
          "mods": [
            {
              "ability_id": 1925087134
            },
            {
              "ability_id": 2971868509
            },
            {
              "ability_id": 499683006
            },
            {
              "ability_id": 3713423303
            },
            {
              "ability_id": 223594321
            },
            {
              "ability_id": 2447176615
            },
            {
              "ability_id": 811521119
            },
            {
              "ability_id": 2356412290
            }
          ],
          "name": "Early Game",
          "width": 1028.0,
          "height": 143.0,
          "description": "You have good sustain and reduce enemy damage. Rush Tesla Bullets to have insane damage."
        },
        {
          "mods": [
            {
              "ability_id": 4053935515
            },
            {
              "ability_id": 3140772621
            },
            {
              "ability_id": 2163598980
            },
            {
              "ability_id": 2533252781
            },
            {
              "ability_id": 3585132399
            }
          ],
          "name": "Mid Game",
          "width": 575.0,
          "height": 141.0,
          "description": "You have a lot of survivability and damage"
        },
        {
          "mods": [
            {
              "ability_id": 3696726732
            },
            {
              "ability_id": 2481177645
            },
            {
              "ability_id": 1102081447
            },
            {
              "ability_id": 787198704
            }
          ],
          "name": "Mid Game Optional",
          "width": 449.0,
          "height": 146.0,
          "description": "Situational items"
        },
        {
          "mods": [
            {
              "ability_id": 1282141666
            },
            {
              "ability_id": 1396247347
            },
            {
              "ability_id": 865846625
            },
            {
              "ability_id": 2037039379
            }
          ],
          "name": "Late Game",
          "width": 501.0,
          "height": 145.0,
          "description": "You''re basically immortal at this point"
        },
        {
          "mods": [
            {
              "ability_id": 3357231760
            },
            {
              "ability_id": 3884003354
            },
            {
              "ability_id": 1055679805
            },
            {
              "ability_id": 4003032160
            }
          ],
          "name": "Late Game Optional",
          "width": 525.0,
          "height": 76.0,
          "description": "In case you''re mega fed"
        }
      ]
    },
    "hero_id": 7,
    "version": 14,
    "language": 0,
    "description": "Super strong early game with kill pontential. Basically with this build you''re mega tanky but also have a lot of damage. You can split push all game to force rotations and enable your teammates.",
    "hero_build_id": 15583,
    "origin_build_id": 0,
    "author_account_id": 68693421,
    "last_updated_timestamp": 1733562876
  },
  "num_favorites": 29868,
  "rollup_category": 1
}', 0, 0, 1),
       (7, 101555, 3, 1180765076, 0, 0, 0, '2025-01-02 12:56:56.000000', '{
         "hero_build": {
           "name": "Город засыпает, просыпается мафия :3 01.01.25",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1842576017,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1842576017,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4147641675,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2981692841,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4147641675,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1999680326,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2981692841,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1999680326,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 1548066885
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 1009965641
                   }
                 ],
                 "name": "Изи лайн, мы еще спим",
                 "width": 1036.5,
                 "height": 150.0,
                 "description": "Изи лайн он для того и изи , нужно просто пожить и не сливать врагу "
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
                     "annotation": "Ставим на первый скилл"
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": "Нужно взять, как слотов не будет можно продать ."
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": "ПОЖИТЬ , ПОЖИТЬ, ПОЖИТЬ"
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": "Хорошее начало для хорошего предмета."
                   },
                   {
                     "ability_id": 2971868509
                   }
                 ],
                 "name": "УЛЬТУ ПОЛУЧИЛ ? Почти проснулись",
                 "width": 552.0,
                 "height": 143.25,
                 "description": "Здесь не жалеем и берем всё "
               },
               {
                 "mods": [
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": "ИМБА"
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": "Если ты в таверне второй раз подряд и есть деньги"
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": "Тоже самое "
                   }
                 ],
                 "name": "Можно и пропустить",
                 "width": 472.5,
                 "height": 199.5,
                 "description": "БАШМАК КУПИТЬ, остально если тебя как суслика  гоняют"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2480592370,
                     "annotation": "ЕСЛИ ТЫ ЧУВСТВУЕШЬ ЧТО ТЕБЯ УЖЕ НЕ ОСТАНОВИТЬ ( И С ФАРМОМ ВСЁ ХОРОШО, И У БАБУЛИ В ДЕРЕВНЕ )"
                   }
                 ],
                 "name": "ВНИМАТЕЛЬНО",
                 "width": 209.25,
                 "height": 112.5,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2356412290,
                     "annotation": "ОГРОМНЫЙ МАГАЗИН"
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": "Места нет ? НЕ ПОКУПАЙ"
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": "Если не купил РИКОШЕТ"
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "СКИП если денег много и хочеш ТИР 4 предмет ( потом купишь ) НА УЛЬТУ"
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "Скип если хочешь ТИР 4 предмет и у тебя денег много ( потом купишь )  НА ВТОРОЙ СКИЛЛ СТАВЬ ЕСЛИ УБЕЖАТЬ а если норм то на УЛЬТУ"
                   }
                 ],
                 "name": "ПРЕД ЛЕЙТ",
                 "width": 555.75,
                 "height": 146.25,
                 "description": "БЕРЕМ ВСЁ , ДАЛЬШЕ ЛЕЙТ"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3696726732,
                     "annotation": "Если ЛЕДИ ГАГА И АБРАМС ЗАЕ#АЛИ"
                   }
                 ],
                 "name": "ПРОТИВ ЖИРУХ И КТО МНОГО ХИЛИТСЯ",
                 "width": 225.0,
                 "height": 157.5,
                 "description": "ТУТ НА  УРОН "
               },
               {
                 "mods": [
                   {
                     "ability_id": 1055679805,
                     "annotation": "ОСНОВА БИЛДА "
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": "МОЖНО ВЗЯТЬ ВТОРЫМ ПРЕДМЕТОМ"
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": "ТУТ ТЫ УЖЕ ПОЛУЧАЕШЬ МНОГО ВАМПИРИЗМА"
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": "МОЖНО СКИП КУПИ СЕБЕ НЕУДЕРЖИМОСТЬ ИЛИ ПРОКЛЯТИЕ"
                   }
                 ],
                 "name": "МАФИЯ ПРОСНУЛАСЬ",
                 "width": 447.0,
                 "height": 118.5,
                 "description": "Тут основа на АКТИВНЫЙ вампиризм , дальше как по кайфу "
               },
               {
                 "mods": [
                   {
                     "ability_id": 3357231760,
                     "annotation": "ВОБЩЕ ПРИГОДИТСЯ В ЛЮБОМ СЛУЧАЕ"
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "ЕСЛИ ВЗЯТЬ ПЕРВЫМ СЛОТОМ :D  ТО ВРАГАМ НЕ ПОВЕЗЛО  ( но не всегда )"
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": "НУ тут уже если катка у вас 50 + минут"
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": "Катка 55+ минут"
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": "Если  у врагов много физ урона от пуль "
                   }
                 ],
                 "name": "ПОЖИТЬ И ИСПОРТИТЬ ЖИЗНЬ ДРУГИМ",
                 "width": 571.5,
                 "height": 148.5,
                 "description": "Внимательно и по ситуации !!!!"
               }
             ]
           },
           "hero_id": 7,
           "version": 3,
           "language": 8,
           "description": "TTV ez_katana  изи сборка ",
           "hero_build_id": 101555,
           "origin_build_id": 0,
           "author_account_id": 1180765076,
           "last_updated_timestamp": 1735822616
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (35, 165599, 1, 1089546464, 1, 0, 0, '2024-11-25 07:55:58.000000', '{
         "hero_build": {
           "name": "New meta build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 3247040238,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3788152387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1020817390,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3788152387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3788152387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3247040238,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1020817390,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1020817390,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3247040238,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3788152387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4206531918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4206531918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4206531918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4206531918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1020817390,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3247040238,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 449.0,
                 "height": 314.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 3190916303,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 568.0,
                 "height": 311.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 699.0,
                 "height": 148.0,
                 "description": null
               }
             ]
           },
           "hero_id": 35,
           "version": 1,
           "language": 0,
           "description": "ww",
           "hero_build_id": 165599,
           "origin_build_id": 19,
           "author_account_id": 1089546464,
           "last_updated_timestamp": 1732521358
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (17, 169811, 1, 132742733, 1, 0, 0, '2024-11-30 14:02:21.000000', '{
         "hero_build": {
           "name": "Fly and spam 1",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 982.0,
                 "height": 139.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   }
                 ],
                 "name": "Category 2",
                 "width": 584.0,
                 "height": 145.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   }
                 ],
                 "name": "Category 3",
                 "width": 1014.0,
                 "height": 162.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 1798666702,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "buy these early for better life",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 17,
           "version": 1,
           "language": 0,
           "description": "figure it out",
           "hero_build_id": 169811,
           "origin_build_id": 0,
           "author_account_id": 132742733,
           "last_updated_timestamp": 1732975341
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (1, 181234, 1, 1081093542, 0, 0, 0, '2024-12-18 22:59:51.000000', '{
         "hero_build": {
           "name": "weird dps infernous build",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   }
                 ],
                 "name": "laning",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   }
                 ],
                 "name": "early mid",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   }
                 ],
                 "name": "mid/late",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 2480592370,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "Category 4",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 1,
           "version": 1,
           "language": 0,
           "description": "its like a haze or wraith build",
           "hero_build_id": 181234,
           "origin_build_id": 0,
           "author_account_id": 1081093542,
           "last_updated_timestamp": 1734562791
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (27, 177830, 2, 122332620, 0, 0, 0, '2024-12-13 02:19:31.000000', '{
         "hero_build": {
           "name": "eido es yamato (12/4)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 3255651252,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2366960452,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2566573207,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3319782965,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3255651252,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3255651252,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3255651252,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2566573207,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2566573207,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3319782965,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3319782965,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3319782965,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2366960452,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2366960452,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2366960452,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2566573207,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 395867183
                   },
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 3862866912
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "Lane",
                 "width": 1023.0,
                 "height": 156.0,
                 "description": "(healing rite if 1 hp in lane)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1976391348
                   },
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 1144549437
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 2059712766
                   }
                 ],
                 "name": "Mid Game first",
                 "width": 558.0,
                 "height": 150.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 2603935618
                   }
                 ],
                 "name": "Mid Game",
                 "width": 231.0,
                 "height": 152.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 4003032160
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": "whenever"
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": "whenever"
                   }
                 ],
                 "name": "armors",
                 "width": 230.0,
                 "height": 148.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 630839635
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 677738769
                   },
                   {
                     "ability_id": 2226497419
                   }
                 ],
                 "name": "luxury",
                 "width": 462.0,
                 "height": 14.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 865846625
                   }
                 ],
                 "name": "Category 6",
                 "width": 553.0,
                 "height": 141.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 3144988365
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   }
                 ],
                 "name": "Category 7",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 27,
           "version": 2,
           "language": 0,
           "description": "echo shard build from his stream (hydration edit)",
           "hero_build_id": 177830,
           "origin_build_id": 147713,
           "author_account_id": 122332620,
           "last_updated_timestamp": 1734056371
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (19, 90382, 1, 989508830, 8, 0, 0, '2024-10-02 22:51:33.000000', '{
         "hero_build": {
           "name": "[~ RAID BOSS SHIV ~]",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   }
                 ],
                 "name": "LANING",
                 "width": 662.0,
                 "height": 154.0,
                 "description": "Buy left --> right, UPGRADE  KNIFE. Just maximize souls rn. Your knife is very good at poke, letting you back them off"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   }
                 ],
                 "name": "BONUS LANING",
                 "width": 357.0,
                 "height": 162.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   }
                 ],
                 "name": "MID GAME",
                 "width": 1030.0,
                 "height": null,
                 "description": "START FARMING CAMPS/VENDING MACHINES.  Focus 70% of time on camps and drones, otherwise, help team applicably and appropriately. Buy order is more flexible but left --> right is still reccomended"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   }
                 ],
                 "name": "MID LATE GAME",
                 "width": 1030.0,
                 "height": null,
                 "description": "YOU ARE NOW AN ASSASSIN. SEEK OUT 1v1s AND WEAK OPPONETS. Your ult should be maxxed and very effective"
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   }
                 ],
                 "name": "LATE GAME RAID BOSS",
                 "width": 447.0,
                 "height": 166.0,
                 "description": "win."
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "OPTIONAL",
                 "width": 576.0,
                 "height": 128.0,
                 "description": "CAN BE HELPFUL, USE YOUR BRAIN TO SEE IF THEY WOULD BE GOOD FOR YOU"
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 0,
           "description": "BEST SHIV BUILD 100% WIN RATE FROM PROFESSIONAL GAMING WARLORD. SLICE, DICE, AND MAKE YOUR ENEMIES BLEED. YOU WILL WIN. ",
           "hero_build_id": 90382,
           "origin_build_id": 2,
           "author_account_id": 989508830,
           "last_updated_timestamp": 1727909493
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 8,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (20, 181418, 4, 252743697, 0, 0, 0, '2024-12-19 10:33:32.000000', '{
         "hero_build": {
           "name": "IQue SLIDEMAXXING MAFIA BOSS",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 4111222521,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3642273386,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1531378655,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1247583368,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3642273386,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3642273386,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1247583368,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1247583368,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1247583368,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1531378655,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1531378655,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3642273386,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1531378655,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4111222521,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4111222521,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4111222521,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 1548066885
                   },
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 3399065363
                   }
                 ],
                 "name": "t1",
                 "width": 445.0,
                 "height": 154.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3077079169
                   }
                 ],
                 "name": "t1 misc",
                 "width": 558.0,
                 "height": 145.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 1414319208
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2951612397
                   }
                 ],
                 "name": "t2",
                 "width": 773.0,
                 "height": 143.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 2059712766
                   }
                 ],
                 "name": "t2 misc",
                 "width": 228.0,
                 "height": 149.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2108215830
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "imbue 2"
                   }
                 ],
                 "name": "t3",
                 "width": 448.0,
                 "height": 147.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 1932939246
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "imbue 4"
                   }
                 ],
                 "name": "t3 misc",
                 "width": 563.0,
                 "height": 44.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1055679805,
                     "annotation": ""
                   },
                   {
                     "ability_id": 339443430
                   },
                   {
                     "ability_id": 1282141666
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2037039379
                   }
                 ],
                 "name": "t4",
                 "width": 555.0,
                 "height": 129.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 2922054143
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "imbue 4"
                   }
                 ],
                 "name": "misc",
                 "width": 447.0,
                 "height": 149.0
               }
             ]
           },
           "hero_id": 20,
           "version": 4,
           "language": 0,
           "description": "Made by worst support oce.\n\nSLIDEMAXXING XDDDDDDDDDDDD",
           "hero_build_id": 181418,
           "origin_build_id": 0,
           "author_account_id": 252743697,
           "last_updated_timestamp": 1734604412
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (2, 68976, 1, 890664056, 0, 0, 0, '2024-09-24 09:56:58.000000', '{
         "hero_build": {
           "name": "7 suzuya",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 539192269,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 539192269,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 539192269,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2061574352,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2061574352,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2061574352,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "1",
                 "width": 671.0,
                 "height": 140.0,
                 "description": "Healing rite only if lane is hard"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   }
                 ],
                 "name": "2",
                 "width": 880.0,
                 "height": 129.0,
                 "description": "Reactive barrier must needed from enemy stun''s"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   }
                 ],
                 "name": "3",
                 "width": 772.0,
                 "height": 147.0,
                 "description": "actually after soul shredder and mystic vuln u should rush surge of power on 3rd spell then everything else"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 1798666702,
                     "annotation": null
                   }
                 ],
                 "name": "4",
                 "width": 985.0,
                 "height": 135.0,
                 "description": "when networth above 20k; boundless is important, armors makes you unkillable"
               }
             ]
           },
           "hero_id": 2,
           "version": 1,
           "language": 0,
           "description": "ttv discription",
           "hero_build_id": 68976,
           "origin_build_id": 1417,
           "author_account_id": 890664056,
           "last_updated_timestamp": 1727171818
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (50, 58724, 2, 88347404, 0, 0, 0, '2024-09-19 11:17:42.000000', '{
         "hero_build": {
           "name": "Arab''s Pocket Build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 938149308,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 938149308,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3747867012,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 938149308,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1976701714,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3747867012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3747867012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2954330093,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -5,
                   "ability_id": 938149308,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2954330093,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2954330093,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2954330093,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1976701714,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3747867012,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 566.0,
                 "height": 420.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   }
                 ],
                 "name": "Important!",
                 "width": 441.0,
                 "height": 421.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 556.0,
                 "height": 307.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 418.0,
                 "height": 305.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "Lategame",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 50,
           "version": 2,
           "language": 0,
           "description": "E",
           "hero_build_id": 58724,
           "origin_build_id": 0,
           "author_account_id": 88347404,
           "last_updated_timestamp": 1726744662
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (17, 210706, 1, 168873683, 0, 0, 0, '2025-03-02 16:31:20.000000', '{
         "hero_build": {
           "name": "TalonDelMundo",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "imbue on 1 "
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 3331811235,
                     "annotation": null
                   }
                 ],
                 "name": "Early/Mid",
                 "width": 776.25,
                 "height": 307.5,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   }
                 ],
                 "name": "Important",
                 "width": 242.25,
                 "height": 306.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2152872419,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 774.0,
                 "height": 303.75,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   }
                 ],
                 "name": "Armor",
                 "width": 238.5,
                 "height": 307.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 2922054143,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 688.5,
                 "height": 158.25,
                 "description": ""
               }
             ]
           },
           "hero_id": 17,
           "version": 1,
           "language": 0,
           "description": "Spirit Focused Carry-ish",
           "hero_build_id": 210706,
           "origin_build_id": 126856,
           "author_account_id": 168873683,
           "last_updated_timestamp": 1740933080
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (19, 13477, 1, 109478389, 0, 0, 0, '2024-08-27 21:28:53.000000', '{
         "hero_build": {
           "name": "MY BUILDGE NO TOUCH",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   }
                 ],
                 "name": "CHEAP ITEMGE",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   }
                 ],
                 "name": "MIDGE ITEMGE",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "LATER ITEMGE",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   }
                 ],
                 "name": "GIGA LATEGE ",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [],
                 "name": "Category 5",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [],
                 "name": "Category 6",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 0,
           "description": "GO AWAY",
           "hero_build_id": 13477,
           "origin_build_id": 0,
           "author_account_id": 109478389,
           "last_updated_timestamp": 1724794133
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (17, 133793, 1, 79498918, 1, 0, 0, '2024-10-28 02:53:46.000000', '{
         "hero_build": {
           "name": "Gooned Grandma",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   }
                 ],
                 "name": "Lane",
                 "width": 660.0,
                 "height": 153.00001525878906,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "If needed",
                 "width": 124.5,
                 "height": 138.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "Core items",
                 "width": 674.0,
                 "height": 146.0,
                 "description": "Everything on Charged Shot"
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   }
                 ],
                 "name": "Bird Buff",
                 "width": 238.0,
                 "height": 158.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "Late items",
                 "width": 770.0,
                 "height": 151.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   }
                 ],
                 "name": "Armor",
                 "width": 238.0,
                 "height": 153.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 337.5,
                 "height": 147.75,
                 "description": ""
               }
             ]
           },
           "hero_id": 17,
           "version": 1,
           "language": 0,
           "description": "Gooning",
           "hero_build_id": 133793,
           "origin_build_id": 124231,
           "author_account_id": 79498918,
           "last_updated_timestamp": 1730084026
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (6, 143410, 5, 246302844, 5, 0, 0, '2024-11-08 11:15:32.000000', '{
         "hero_build": {
           "name": "Blue Jerk",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 715762406,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2824119765,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 715762406,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2824119765,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 715762406,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 715762406,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2824119765,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 509856396,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 509856396,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2824119765,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 465043967,
                     "annotation": "Sell if need a slot"
                   },
                   {
                     "ability_id": 26002154,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 771.0,
                 "height": 148.0,
                 "description": "First 3 in order, then situational"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Situational lane",
                 "width": 249.0,
                 "height": 149.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1252627263,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": "More stun time for second ability = less time for enemy to parry"
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": "First ability"
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 2481177645,
                     "annotation": "Good for 1v1"
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 1076.0,
                 "height": 152.0,
                 "description": "Buy in order"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2717651715,
                     "annotation": "Second ability"
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "Second ability"
                   }
                 ],
                 "name": "Mid+",
                 "width": 467.0,
                 "height": 146.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": "Great against Wraith''s ult"
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 555.0,
                 "height": 155.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": "Sell Spirit Strike if no slots left"
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 1030.0,
                 "height": null,
                 "description": "Buy Leech first, then situational"
               }
             ]
           },
           "hero_id": 6,
           "version": 5,
           "language": 0,
           "description": "Love punching everything that moves? This is the build!",
           "hero_build_id": 143410,
           "origin_build_id": 0,
           "author_account_id": 246302844,
           "last_updated_timestamp": 1731064532
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 5,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (15, 101366, 14, 874169346, 0, 0, 0, '2024-11-05 00:10:35.000000', '{
         "hero_build": {
           "name": "Gun bebop | mode: chorniy diplom",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1928108461,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3089858203,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1928108461,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2521902222,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2521902222,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3089858203,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3832675871,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3832675871,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 465043967
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "Regen/Rite optional",
                 "width": 232.0,
                 "height": 534.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 619484391
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 2447176615
                   }
                 ],
                 "name": "After lane",
                 "width": 233.09999,
                 "height": 533.69995,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 365620721
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 1235347618
                   }
                 ],
                 "name": "GC first if snowballing",
                 "width": 229.0,
                 "height": 534.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1055679805
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 1798666702
                   },
                   {
                     "ability_id": 1396247347
                   }
                 ],
                 "name": "Late game",
                 "width": 228.59999,
                 "height": 532.8
               },
               {
                 "mods": [
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": "TB if there''s a lot of healing in enemy team OR u need healbane early"
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 3133167885
                   },
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 4003032160
                   }
                 ],
                 "name": "Situational",
                 "width": 1026.9,
                 "height": 301.73013
               },
               {
                 "mods": [
                   {
                     "ability_id": 2800629741
                   }
                 ],
                 "name": "",
                 "width": 113.399994,
                 "height": 113.399994
               }
             ]
           },
           "hero_id": 15,
           "version": 14,
           "language": 0,
           "description": "50541",
           "hero_build_id": 101366,
           "origin_build_id": 62801,
           "author_account_id": 874169346,
           "last_updated_timestamp": 1730765435
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (12, 184505, 1, 154191414, 0, 0, 0, '2024-12-26 22:26:16.000000', '{
         "hero_build": {
           "name": "Pos 4 Kelvin - Flawless",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 18921423,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 18921423,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3826390464,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3826390464,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2351041382,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1963397252,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 3144988365
                   }
                 ],
                 "name": "Early",
                 "width": 984.0,
                 "height": 146.0,
                 "description": "buy healing rite in hard lanes"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197
                   },
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 1932939246
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 3713423303
                   }
                 ],
                 "name": "Mid",
                 "width": 770.0,
                 "height": 167.0,
                 "description": "rushing rapid recharge it your best power spike with max nade"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 869090587
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 630839635
                   }
                 ],
                 "name": "Late Damage",
                 "width": 446.0,
                 "height": 157.0,
                 "description": "imp burst best for dmg"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 1804594021
                   },
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 2956256701
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 3140772621
                   }
                 ],
                 "name": "Late Utility",
                 "width": 770.0,
                 "height": 161.0,
                 "description": "can buy healing items earlier if its a good game for it"
               }
             ]
           },
           "hero_id": 12,
           "version": 1,
           "language": 0,
           "description": "123",
           "hero_build_id": 184505,
           "origin_build_id": 0,
           "author_account_id": 154191414,
           "last_updated_timestamp": 1735251976
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (19, 125622, 2, 121054952, 0, 0, 0, '2024-10-25 11:51:23.000000', '{
         "hero_build": {
           "name": "Shev (Lan3''s)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1835738020,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2460791803,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1537272748,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2460791803,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1458044103,
                   "annotation": "",
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1342610602,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": ""
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": ""
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": ""
                   }
                 ],
                 "name": "Lane",
                 "width": 1057,
                 "height": 157,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": ""
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": ""
                   }
                 ],
                 "name": "Mid",
                 "width": 1032,
                 "height": 147,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594,
                     "annotation": ""
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": ""
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": ""
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": ""
                   }
                 ],
                 "name": "End",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684,
                     "annotation": ""
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": ""
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": ""
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": ""
                   }
                 ],
                 "name": "Upgrades",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               }
             ]
           },
           "hero_id": 19,
           "version": 2,
           "language": 0,
           "description": "twitch.tv/imlan3",
           "hero_build_id": 125622,
           "origin_build_id": 0,
           "author_account_id": 121054952,
           "last_updated_timestamp": 1729857083
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (19, 51917, 1, 275134036, 2, 0, 0, '2024-09-16 00:02:07.000000', '{
         "hero_build": {
           "name": "Dandy Shiv Build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2460791803,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": "Buy if solo laning"
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   }
                 ],
                 "name": "Early game",
                 "width": 383.0,
                 "height": 300.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "For movement",
                 "width": 160.0,
                 "height": 300.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": "Healbane works REALLY WELL with bloodletting"
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   }
                 ],
                 "name": "Mid game",
                 "width": 404.0,
                 "height": 299.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   }
                 ],
                 "name": "Core items",
                 "width": 445.0,
                 "height": 149.0,
                 "description": "Get these before late game"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182,
                     "annotation": "FOR THE SUPER COOL DANDY SLIDE TECH"
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   }
                 ],
                 "name": "Late game",
                 "width": 582.0,
                 "height": 151.0,
                 "description": "Sell swift striker if you have it by now to get burst fire"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": "Inplace for healing rate"
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "Tankier build",
                 "width": 387.0,
                 "height": 169.0,
                 "description": "bad team? more health!"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": "In place for unstoppable "
                   }
                 ],
                 "name": "Funny chase",
                 "width": 639.0,
                 "height": 144.0,
                 "description": "Escape was never an option... (WIP)"
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 0,
           "description": "Basic shiv build for burst fire damage and having fun! ",
           "hero_build_id": 51917,
           "origin_build_id": 0,
           "author_account_id": 275134036,
           "last_updated_timestamp": 1726444927
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (2, 108134, 3, 1020497637, 0, 0, 0, '2024-10-25 03:50:50.000000', '{
         "hero_build": {
           "name": "デカ玉",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1074714947,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 539192269,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1065103387,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1065103387,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1074714947,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1074714947,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 539192269,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 539192269,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 539192269,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2061574352,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2061574352,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2061574352,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1074714947,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2061574352,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1548066885
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 3776945997
                   }
                 ],
                 "name": "序盤",
                 "width": 452.0,
                 "height": 320.0,
                 "description": "順番は適当"
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 1144549437
                   },
                   {
                     "ability_id": 3147316197
                   }
                 ],
                 "name": "～中盤",
                 "width": 573.0,
                 "height": 327.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 1193964439
                   }
                 ],
                 "name": "中盤～",
                 "width": 1030.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 869090587
                   }
                 ],
                 "name": "6200",
                 "width": 1030.0,
                 "description": "　"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 1254091416
                   }
                 ],
                 "name": "必要なら",
                 "width": 454.0,
                 "height": 297.71667
               },
               {
                 "mods": [
                   {
                     "ability_id": 630839635
                   },
                   {
                     "ability_id": 1102081447
                   },
                   {
                     "ability_id": 2356412290
                   },
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 3403085434
                   }
                 ],
                 "name": "あってもいい",
                 "width": 539.0,
                 "height": 294.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 2,
           "version": 3,
           "language": 10,
           "description": "あ",
           "hero_build_id": 108134,
           "origin_build_id": 0,
           "author_account_id": 1020497637,
           "last_updated_timestamp": 1729828250
         },
         "rollup_category": 4
       }', 10, 0, 4),
       (27, 90057, 1, 115241505, 0, 0, 0, '2024-10-02 19:37:06.000000', '{
         "hero_build": {
           "name": "ALIVE build",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 465043967,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 883.0,
                 "height": 142.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   }
                 ],
                 "name": "save money for this",
                 "width": 126.0,
                 "height": 133.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   }
                 ],
                 "name": "Mid game",
                 "width": 836.0,
                 "height": 144.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   }
                 ],
                 "name": "Anti heal",
                 "width": 138.0,
                 "height": 145.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1252627263,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "late",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 865958998,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   }
                 ],
                 "name": "greens",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 27,
           "version": 1,
           "language": 0,
           "description": "123",
           "hero_build_id": 90057,
           "origin_build_id": 0,
           "author_account_id": 115241505,
           "last_updated_timestamp": 1727897826
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null);
