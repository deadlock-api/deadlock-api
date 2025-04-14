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

create index hero_builds_author_id_index on hero_builds (author_id);
create index hero_builds_weekly_favorites_index on hero_builds (weekly_favorites desc);
create index hero_builds_language_index on hero_builds (language);

INSERT INTO hero_builds (hero, build_id, version, author_id, favorites, ignores, reports, updated_at, data, language,
                         weekly_favorites, rollup_category)
VALUES (15, 192325, 16, 84801726, 0, 0, 0, '2025-01-30 03:52:04.000000', '{
  "hero_build": {
    "name": "gun - pctt",
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
            "ability_id": 3089858203,
            "currency_type": 2
          },
          {
            "delta": -1,
            "ability_id": 2521902222,
            "currency_type": 2
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
            "delta": -1,
            "ability_id": 1928108461,
            "currency_type": 1
          },
          {
            "delta": -2,
            "ability_id": 1928108461,
            "currency_type": 1
          },
          {
            "delta": -1,
            "ability_id": 2521902222,
            "currency_type": 1
          },
          {
            "delta": -5,
            "ability_id": 1928108461,
            "currency_type": 1
          },
          {
            "delta": -5,
            "ability_id": 3089858203,
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
              "ability_id": 668299740
            },
            {
              "ability_id": 2678489038
            },
            {
              "ability_id": 465043967
            },
            {
              "ability_id": 754480263
            },
            {
              "ability_id": 4104549924
            },
            {
              "ability_id": 1235347618
            },
            {
              "ability_id": 84321454
            },
            {
              "ability_id": 4139877411
            },
            {
              "ability_id": 499683006
            },
            {
              "ability_id": 1710079648,
              "annotation": "if needed"
            }
          ],
          "name": "Lane",
          "width": 684.0,
          "height": 319.5,
          "description": "Tier 2 hook or uppercut first depending on lane"
        },
        {
          "mods": [
            {
              "ability_id": 393974127
            },
            {
              "ability_id": 365620721
            }
          ],
          "name": "Buy early if you''re ahead, or buy later if you get fed",
          "width": 339.0,
          "height": 225.0
        },
        {
          "mods": [
            {
              "ability_id": 2407033488
            },
            {
              "ability_id": 1055679805
            },
            {
              "ability_id": 619484391
            },
            {
              "ability_id": 2971868509
            }
          ],
          "name": "After Lane",
          "width": 446.25,
          "height": 150.0,
          "description": "usually silence glyph"
        },
        {
          "mods": [
            {
              "ability_id": 2617435668,
              "annotation": "mostly to prevent them from using actives"
            },
            {
              "ability_id": 1254091416,
              "annotation": "buy this early if you hate vindictas"
            },
            {
              "ability_id": 1813726886
            }
          ],
          "name": "other cc",
          "width": 336.0,
          "height": 131.25,
          "description": ""
        },
        {
          "mods": [
            {
              "ability_id": 3713423303
            },
            {
              "ability_id": 223594321
            }
          ],
          "name": "Armors",
          "width": 228.75,
          "height": 155.25
        },
        {
          "mods": [
            {
              "ability_id": 3884003354
            },
            {
              "ability_id": 2739107182
            },
            {
              "ability_id": 3585132399
            }
          ],
          "name": "Late Game",
          "width": 341.25,
          "height": 153.75
        },
        {
          "mods": [
            {
              "ability_id": 339443430
            },
            {
              "ability_id": 1396247347
            },
            {
              "ability_id": 1282141666
            },
            {
              "ability_id": 2037039379
            }
          ],
          "name": "Final",
          "width": 446.25,
          "height": 153.75,
          "description": "Whatever feels right"
        },
        {
          "mods": [
            {
              "ability_id": 2481177645
            },
            {
              "ability_id": 2463960640
            }
          ],
          "name": "If needed",
          "width": 232.5,
          "height": 143.25
        },
        {
          "mods": [
            {
              "ability_id": 3361075077,
              "annotation": "buy if they buy"
            },
            {
              "ability_id": 2603935618,
              "annotation": "antiheal"
            },
            {
              "ability_id": 2533252781,
              "annotation": "for lash/infernus ults"
            },
            {
              "ability_id": 3731635960,
              "annotation": "vs infernus/pocket"
            },
            {
              "ability_id": 1378931225,
              "annotation": "against heavy gun teams"
            },
            {
              "ability_id": 3357231760,
              "annotation": "if enemy team has a lot of hard cc"
            }
          ],
          "name": "Situationals",
          "width": 668.25,
          "height": 143.25
        }
      ]
    },
    "hero_id": 15,
    "version": 16,
    "language": 0,
    "description": "bebop\npctt123.tv",
    "hero_build_id": 192325,
    "origin_build_id": 0,
    "author_account_id": 84801726,
    "last_updated_timestamp": 1738209124
  },
  "rollup_category": 2,
  "num_weekly_favorites": 350
}', 0, 350, 2),
       (6, 147107, 1, 411875688, 0, 0, 0, '2024-11-07 17:31:59.000000', '{
         "hero_build": {
           "name": "eliasmercury (АБРАМС)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 715762406,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 715762406,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2824119765,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4072270083,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4072270083,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 715762406,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4072270083,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 715762406,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": 5,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": 5,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4072270083,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1437614329
                   },
                   {
                     "ability_id": 465043967
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 2971868509
                   }
                 ],
                 "name": "Начальный этап",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 26002154
                   },
                   {
                     "ability_id": 1414319208
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 2481177645
                   }
                 ],
                 "name": "Категория 2",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1252627263
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 2095565695
                   }
                 ],
                 "name": "Категория 3",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 1055679805
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 365620721
                   },
                   {
                     "ability_id": 3884003354
                   }
                 ],
                 "name": "Категория 5",
                 "width": 1030.0,
                 "description": "Последние 3 по ситуации (смотря что лучше будет)"
               }
             ]
           },
           "hero_id": 6,
           "version": 1,
           "language": 8,
           "description": "Абрамс",
           "hero_build_id": 147107,
           "origin_build_id": 0,
           "author_account_id": 411875688,
           "last_updated_timestamp": 1731000719
         },
         "rollup_category": 3,
         "num_daily_favorites": 1
       }', 8, 0, 3),
       (15, 143941, 1, 316990354, 0, 0, 0, '2024-11-04 18:57:08.000000', '{
         "hero_build": {
           "name": "GurpBop",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3089858203,
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
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 465043967,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   }
                 ],
                 "name": "EARLY",
                 "width": 1030.0,
                 "height": null,
                 "description": "Right click no for charge up"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182,
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
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 865958998,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "MID",
                 "width": 672.0,
                 "height": 144.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   }
                 ],
                 "name": "Active City",
                 "width": 351.0,
                 "height": 134.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "LATE",
                 "width": 1031.0,
                 "height": 147.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3133167885,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 2800629741,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": "Can sell barriers for armor lategame"
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": "Can sell barriers for armor lategame"
                   },
                   {
                     "ability_id": 1798666702,
                     "annotation": null
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "LUXURY/OPTIONAL",
                 "width": 1030.0,
                 "height": null,
                 "description": ""
               }
             ]
           },
           "hero_id": 15,
           "version": 1,
           "language": 0,
           "description": "fLOPbOP",
           "hero_build_id": 143941,
           "origin_build_id": 128356,
           "author_account_id": 316990354,
           "last_updated_timestamp": 1730746628
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (7, 54655, 1, 166101762, 0, 0, 0, '2024-09-17 09:50:37.000000', '{
         "hero_build": {
           "name": "レイス　ソロキャリービルドver0.2",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
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
                   "ability_id": 1999680326,
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
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 1998374645
                   }
                 ],
                 "name": "レーン戦",
                 "width": 680.25,
                 "height": 157.50002
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 2951612397
                   }
                 ],
                 "name": "序盤",
                 "width": 883.50006,
                 "height": 165.75002,
                 "description": "ファーム～オブジェクト"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 2717651715
                   }
                 ],
                 "name": "中盤　戦闘",
                 "width": 673.5,
                 "height": 152.25002
               },
               {
                 "mods": [
                   {
                     "ability_id": 365620721
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2480592370
                   },
                   {
                     "ability_id": 4003032160
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 3357231760
                   }
                 ],
                 "name": "終盤",
                 "width": 778.50006,
                 "height": 165.74997
               },
               {
                 "mods": [
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 2617435668
                   }
                 ],
                 "name": "対策",
                 "width": 558.0,
                 "height": 153.75002
               },
               {
                 "mods": [
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 600033864
                   },
                   {
                     "ability_id": 2800629741
                   }
                 ],
                 "name": "タワーおりたいとき",
                 "width": 671.25,
                 "height": 138.75002,
                 "description": "逃げる時に使う やばさでわける 1->3"
               }
             ]
           },
           "hero_id": 7,
           "version": 1,
           "language": 10,
           "description": "マジであるふぁ",
           "hero_build_id": 54655,
           "origin_build_id": 1272,
           "author_account_id": 166101762,
           "last_updated_timestamp": 1726566637
         },
         "rollup_category": 3,
         "num_daily_favorites": 1
       }', 10, 0, 3),
       (8, 108418, 2, 43372181, 0, 0, 0, '2024-10-12 21:53:14.000000', '{
         "hero_build": {
           "name": "Turret Syndrome 2.0",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   }
                 ],
                 "name": "CORE 500",
                 "width": 337.0,
                 "height": 142.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   }
                 ],
                 "name": "SELL 500",
                 "width": 336.0,
                 "height": 141.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   }
                 ],
                 "name": "OPT 500",
                 "width": 236.0,
                 "height": 147.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   }
                 ],
                 "name": "CORE 1250",
                 "width": 444.0,
                 "height": 302.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   }
                 ],
                 "name": "FLEX 1250",
                 "width": 229.0,
                 "height": 301.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235,
                     "annotation": null
                   },
                   {
                     "ability_id": 381961617,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   }
                 ],
                 "name": "OPT 1250",
                 "width": 341.0,
                 "height": 298.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
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
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   }
                 ],
                 "name": "CORE 3000",
                 "width": 446.0,
                 "height": 297.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   }
                 ],
                 "name": "FLEX 3000",
                 "width": 229.0,
                 "height": 298.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2152872419,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   }
                 ],
                 "name": "OPT 3000",
                 "width": 337.0,
                 "height": 298.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "LATE CORE",
                 "width": 636.0,
                 "height": 124.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   }
                 ],
                 "name": "LATE OPT",
                 "width": 366.0,
                 "height": 120.0,
                 "description": null
               }
             ]
           },
           "hero_id": 8,
           "version": 2,
           "language": 0,
           "description": "Omg lol kek",
           "hero_build_id": 108418,
           "origin_build_id": 0,
           "author_account_id": 43372181,
           "last_updated_timestamp": 1728769994
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (25, 221401, 4, 853264819, 4, 0, 0, '2025-03-30 19:40:37.000000', '{
         "hero_build": {
           "name": "hybird ult carry warden",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": "sell if slot needed for improved duration/diviners"
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   }
                 ],
                 "name": "early lane",
                 "width": 882.0,
                 "height": 190.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   }
                 ],
                 "name": "mystic",
                 "width": 108.0,
                 "height": 191.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   }
                 ],
                 "name": "CORE",
                 "width": 270.0,
                 "height": 301.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   }
                 ],
                 "name": "buy one or both",
                 "width": 144.0,
                 "height": 302.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 2922054143,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   }
                 ],
                 "name": "LANE COUNTERPLAY",
                 "width": 577.0,
                 "height": 302.0,
                 "description": "get 1 or 2 to aid in lane/post-lane"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": "Try to save for this when you have good econ, on average buy around the 20k mark"
                   }
                 ],
                 "name": "MUST BUY",
                 "width": 54.0,
                 "height": 113.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "late game",
                 "width": 445.0,
                 "height": 155.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "flex purples",
                 "width": 447.0,
                 "height": 161.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 1804594021,
                     "annotation": null
                   }
                 ],
                 "name": "flex greens",
                 "width": 485.0,
                 "height": 443.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2481177645,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   }
                 ],
                 "name": "flex oranges",
                 "width": 474.0,
                 "height": 560.0706787109375,
                 "description": null
               }
             ]
           },
           "hero_id": 25,
           "version": 4,
           "language": 0,
           "description": "tigrex''s warden",
           "hero_build_id": 221401,
           "origin_build_id": 0,
           "author_account_id": 853264819,
           "last_updated_timestamp": 1743363637
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 4,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (7, 222439, 3, 1094520258, 185, 0, 0, '2025-04-03 01:17:24.000000', '{
         "hero_build": {
           "name": "Metro Surge Wraith V5.7 (twitch.tv/7liamp7)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": "Never sell this, always use before Full Auto in every fight. In lane, use to amplify card damage as usual.\n\nObvio"
                   },
                   {
                     "ability_id": 3776945997,
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
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Laning",
                 "width": 987.0,
                 "height": 146.0,
                 "description": "Buy From Left To Right, Extra Regen and Healing Rite Optional"
               },
               {
                 "mods": [
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   }
                 ],
                 "name": "Midgame",
                 "width": 664.0,
                 "height": 299.0,
                 "description": "Buy From Left To Right,  Sell EC, RR and HB if needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   }
                 ],
                 "name": "Utility Items As Needed",
                 "width": 340.0,
                 "height": 299.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1282141666,
                     "annotation": "If you need more long term survivability and fights last for a while. Sell one of your barriers for this."
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": "If you need more Damage."
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": "Buy if you want even mroe long term sustain in teamfights or if you want more anti heal. Saves a slot."
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": "Sell Bullet Lifesteal for this ONLY if you bought Leech. Do not buy if you don''t have Leech."
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": "Sell Swift Striker or Enduring Speed for this. It''s an upgrade over both of those as a lategame damage increase. Only worth if you are rich."
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": "Buy if enemy team is running a lot of gun damage. Great team play option. Sell Ammo Scav For This."
                   }
                 ],
                 "name": "Late Game",
                 "width": 768.0,
                 "height": 127.0,
                 "description": "Buy What Is Needed From This Point (All Items have Annotations)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 1113837674,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": "Buy this if you need more short term survivability. Insane for the first 7 seconds of the fight."
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 986.0,
                 "height": 147.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 7,
           "version": 3,
           "language": 0,
           "description": "for only the coolest of kids B)",
           "hero_build_id": 222439,
           "origin_build_id": 214777,
           "author_account_id": 1094520258,
           "last_updated_timestamp": 1743643044
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 185,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (18, 20699, 1, 113447394, 1, 0, 0, '2024-09-01 03:34:35.000000', '{
         "hero_build": {
           "name": "A Terrible Mo & Krill Build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": "Has useful regen along with making Mo take less damage from creeps in lane / able to jungle easy camps immediately."
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": "Help to last hit and builds into Headhunter."
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": "More dodges."
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": "Faster movespeed."
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": "More immediate burst and AoE for clearing camps / jumping a target."
                   }
                 ],
                 "name": "Lane",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": "Drastically speed up farm speed and amping damage while using Burrow and Ult."
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": "You will take damage, might as well get damage for it."
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": "Good team utility and personal survival skill."
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": "Speed. You are a roaming jungler / ganker."
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": "Even more speed."
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": "Longer burrow, disarm, and combo is strong."
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": "Mo has a strong ability kit."
                   }
                 ],
                 "name": "Mid Game",
                 "width": 780.0000610351562,
                 "height": 168.75001525878906,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": "Buy as needed for dealing with healing."
                   }
                 ],
                 "name": "Anti-Heal",
                 "width": 160.49996948242188,
                 "height": 163.50001525878906,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 4053935515,
                     "annotation": "Strong item, a bunch of good stats."
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "Put on your ultimate."
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "Put on your ultimate."
                   },
                   {
                     "ability_id": 865958998,
                     "annotation": "Decent stats and good for getting picks from fog of war."
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": "Even more dodges."
                   }
                 ],
                 "name": "Late Game",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": "Immediate jump for you to use your ult."
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": "Allows regen without needing to back."
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": "Additional CC"
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": "Refresh ult, profit."
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "More CC."
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": "Highest damage amp for killing with ultimate."
                   }
                 ],
                 "name": "Ultra Late / Luxury",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 18,
           "version": 1,
           "language": 0,
           "description": "It is what it is.",
           "hero_build_id": 20699,
           "origin_build_id": 0,
           "author_account_id": 113447394,
           "last_updated_timestamp": 1725161675
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (50, 62517, 1, 1107784154, 2, 0, 0, '2024-09-21 06:55:49.000000', '{
         "hero_build": {
           "name": "Puck Out!",
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
                   "ability_id": 3747867012,
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
                   "delta": -2,
                   "ability_id": 938149308,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
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
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 938149308,
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
                     "ability_id": 558396679,
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
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "opener T1''s ",
                 "width": 926.0,
                 "height": 153.0,
                 "description": "buy ALL - Healing Rite only for losing/poke lanes. sell heal rite/endure for Phantomstrike"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567,
                     "annotation": "really good for early ganks and initiations. Also amazing for tower shred and farming neutrals"
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": "Your biggest powerspike in the game. Should be 1st or 2nd T3. \nAmazing for clearing and Burst."
                   },
                   {
                     "ability_id": 600033864,
                     "annotation": "Use this for Engage with barrage.\nI usually get it after warp + improved burst."
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": "Use this for escape or bullet resistance.\nusually my first t3. weapon dmg good for farming + towers, with your long cd abilities."
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": "make sure to auto before you use your abilities. after barrage."
                   }
                 ],
                 "name": "7-15k Souls",
                 "width": 561.0,
                 "height": 146.0,
                 "description": "Improved Burst FIRST  After T2''s, Then Choice."
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748,
                     "annotation": "gives cooldown on all actives. buy this."
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": "Good for sustain against neutrals and going back to base less."
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": "Great for getting around map, Slow Resistance and hard farming games."
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": "Spirit Resist is SUPER important for pocket. + provides team util by taking their spirit res."
                   }
                 ],
                 "name": "Core  Post 15k",
                 "width": 451.0,
                 "height": 155.0,
                 "description": "Boots/Lifesteal For Farm"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684,
                     "annotation": "I usually imbue Cloak for 1v9 Hard Carry\nAffliction for Team Util/Sweaty Games"
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": "Use this is entry with majestic, then exit with ur stam + warp stone"
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": "Buy armors after this."
                   }
                 ],
                 "name": "Powerspikes",
                 "width": 398.0,
                 "height": 141.0,
                 "description": "Phantom is most important."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2095565695,
                     "annotation": "often better than bullet armor, buy this if possible."
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": "IMPORTANT for heavy healing characters. buy this if needed"
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   }
                 ],
                 "name": "Extra Situationals",
                 "width": 608.0,
                 "height": 153.0,
                 "description": "Armors PRIO After Powerspike Items. +AntiHeal"
               },
               {
                 "mods": [
                   {
                     "ability_id": 4003032160,
                     "annotation": "Live. Laugh. love"
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": "Amazing Stats, good for living after big ult initiation. "
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": "if for some reason ur buying this, imbue ur ult."
                   }
                 ],
                 "name": "Choose ur T4",
                 "width": 597.0,
                 "height": 170.0,
                 "description": "After All Basic Armor/Powerspikes are bought. L-R"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621,
                     "annotation": "Useful Against hard carry GUN Characters\n(haze, wraith, dynamo, Abrams)"
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": "Useful against hard carry Spirit Characters\n(Lash, Shiv, Seven, Spirit Talon + more)"
                   }
                 ],
                 "name": "Armors",
                 "width": 394.0,
                 "height": 153.0,
                 "description": "NOT essential, But Useful"
               }
             ]
           },
           "hero_id": 50,
           "version": 1,
           "language": 0,
           "description": "RANZ ULOL",
           "hero_build_id": 62517,
           "origin_build_id": 18734,
           "author_account_id": 1107784154,
           "last_updated_timestamp": 1726901749
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (27, 51472, 1, 192323077, 0, 0, 0, '2024-09-15 19:36:07.000000', '{
         "hero_build": {
           "name": "YAMATO DO BRASIL",
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
                   "ability_id": 2366960452,
                   "currency_type": 1
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
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 1797283378
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 558396679
                   }
                 ],
                 "name": "EARLYGAME PRIORIDADE",
                 "width": 1028.0,
                 "height": 145.0,
                 "description": "COMPRE PRIMEIRO AS VERDES, LARANJA ATIVAVEL E ROXO"
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 1144549437
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 1998374645
                   }
                 ],
                 "name": "MIDGAME PRIORIDADE",
                 "width": 1043.0,
                 "height": 148.0,
                 "description": "ANTICURA- LARANJA -ROUBO DE VIDA E O RESTO"
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
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 677738769
                   }
                 ],
                 "name": "LATE GAME",
                 "width": 553.0,
                 "height": 153.0,
                 "description": "COLOQUE EM TRANSFORMAÇÃO SOMBRIA"
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 339443430
                   }
                 ],
                 "name": "DEPOIS DA BUILD COMPLETA COMPRE ESSES",
                 "width": 469.0,
                 "height": 76.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 869090587
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1378931225
                   }
                 ],
                 "name": "LATE GAME PRIORIDADE BAIXA",
                 "width": 1033.0,
                 "height": 128.0,
                 "description": "REVERBERAÇÃO COLOQUE EM CORTE PODEROSO( RESTAURADOR PRIMEIRO PICK)"
               }
             ]
           },
           "hero_id": 27,
           "version": 1,
           "language": 22,
           "description": "O MELHOR DO BRASIL, YAMATO IMORTAL, IMPOSSIVEL MORRER POS 30 MIN DE GAME",
           "hero_build_id": 51472,
           "origin_build_id": 2,
           "author_account_id": 192323077,
           "last_updated_timestamp": 1726428967
         },
         "rollup_category": 3,
         "num_daily_favorites": 1
       }', 22, 0, 3),
       (8, 116518, 1, 885118927, 0, 0, 0, '2024-10-17 15:34:39.000000', '{
         "hero_build": {
           "name": "McGinnis Mustafah08",
           "details": {
             "ability_order": {},
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 3261353684
                   }
                 ],
                 "name": "1ª categoria",
                 "width": 1048.0,
                 "height": 136.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 3005970438
                   }
                 ],
                 "name": "2ª categoria",
                 "width": 1097.0,
                 "height": 79.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 2108215830
                   },
                   {
                     "ability_id": 3147316197
                   }
                 ],
                 "name": "3ª categoria",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 8,
           "version": 1,
           "language": 22,
           "description": "DALE",
           "hero_build_id": 116518,
           "origin_build_id": 0,
           "author_account_id": 885118927,
           "last_updated_timestamp": 1729179279
         },
         "rollup_category": 4
       }', 22, 0, 4),
       (1, 7108, 2, 106413394, 1, 0, 0, '2024-08-19 23:00:20.000000', '{
         "hero_build": {
           "name": "Ебля раков",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 1030.0,
                 "height": null,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 381961617,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   }
                 ],
                 "name": "Category 2",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 7409189,
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
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "Category 3",
                 "width": 349.0,
                 "height": 329.0,
                 "description": null
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
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "Category 4",
                 "width": 664.0,
                 "height": 179.0,
                 "description": null
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
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "Category 5",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 1,
           "version": 2,
           "language": 0,
           "description": "Sosal?",
           "hero_build_id": 7108,
           "origin_build_id": 0,
           "author_account_id": 106413394,
           "last_updated_timestamp": 1724108420
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (19, 167348, 13, 276521562, 0, 0, 0, '2024-11-27 09:04:37.000000', '{
         "hero_build": {
           "name": "GRONFOLD (TTV l_Gron_l)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2460791803,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2460791803,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1835738020,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1458044103,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1537272748,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": "Buy first if low health in lane around 50% hp"
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": "Buy first if not low health in lane"
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": "This Item increases your bleed dps substantially It grants damage, duration and stacks with your bleed damage. As a bonus it nerfs healing too."
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 3399065363
                   }
                 ],
                 "name": "Laning",
                 "width": 877.0,
                 "height": 148.0,
                 "description": "Replace Decay with Slowing Hex or Cold Front"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182,
                     "annotation": "Huge for movement and dps one of shivs most FUN items, SLIDE FOREVER!"
                   }
                 ],
                 "name": "SLIDE",
                 "width": 19.0,
                 "height": 145.0,
                 "description": "<3"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1644605047,
                     "annotation": "Bebop"
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": "I think this is one of shivs best items"
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": "Really good sometimes"
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": "Lash"
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": "Good for powerfarming and if you need some spirit resist"
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": "Warden and Wraith\nreplaces boots"
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": "Get if you are going for slowing hex"
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": "laning item for hard lane buy when you REALLY need heal early"
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": "Laning item for poke damage"
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": "Better as an early purchase"
                   }
                 ],
                 "name": "Situational",
                 "width": 663.0,
                 "height": 297.0,
                 "description": "Early Counter Picks"
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": "Buy this or Kinetic dash in lane \n(more poke and spirit dmg)"
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": "Buy this or Mystic shot in lane \n(More mobility, Fire rate and Ammo)"
                   },
                   {
                     "ability_id": 1144549437
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": "huge synergy with ult, chain heal on kill."
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": "No u"
                   },
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": "Bleed"
                   }
                 ],
                 "name": "Mid",
                 "width": 984.0,
                 "height": 148.0,
                 "description": "Prioritize gun first | Mystic Shot or Kinetic Dash is best power spike early | Duration if you have extra slots or skip decay"
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704,
                     "annotation": "Huge power spike for knife dps and gun knife combo"
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": "Replace with Superior Stamina if you went extra stamina instead of boots"
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "SLICE AND DICE \n(buy after tier 3 upgrade)"
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": "\"Bullet Armor\" PB"
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": "\"Spirit Armor\" EE"
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 1150006784
                   },
                   {
                     "ability_id": 4075861416
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "BLEEEEEED"
                   }
                 ],
                 "name": "Upgrades",
                 "width": 984.0,
                 "height": 176.0,
                 "description": "Duration replace decay | Get PB or EE First depending on damage taken for 15% resist | Rapid Recharge ASAP"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419,
                     "annotation": "Better in the mid-late game"
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": "better as an early-mid purchase"
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": "PUT THIS SHIT ON SLICE AND DICE"
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": "I''m going to suck your dick, I mean, your blood."
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 4003032160
                   }
                 ],
                 "name": "Late Game or Fed",
                 "width": 339.0,
                 "height": 297.0,
                 "description": "Spiritual Overflow and Frenzy best"
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625,
                     "annotation": "Get this one"
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": "It''s alright"
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": "this is ok"
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": "Also ok"
                   }
                 ],
                 "name": "Healing",
                 "width": 229.0,
                 "height": 297.0,
                 "description": "Leech is best on shiv"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   }
                 ],
                 "name": "Armor",
                 "width": 230.0,
                 "height": 296.0,
                 "description": "BUY BASED ON DAMAGE TAKEN"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3731635960,
                     "annotation": "My favorite"
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": "Hoovy - \"I AM BULLETPROOF!\" \nCirca June 23 2011"
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": "Omae wa mou shindeiru"
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": "Yamato ult"
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "You DO NOT get to play the game"
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": "No abilities for you"
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": "ANTI-AIR ANVIL"
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": "Oh shit button"
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": "Oh shit button"
                   }
                 ],
                 "name": "Counter",
                 "width": 985.0,
                 "height": 151.0,
                 "description": "I almost always get debuff remover"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407781327,
                     "annotation": "FAT ELVIS"
                   },
                   {
                     "ability_id": 1437614329
                   },
                   {
                     "ability_id": 1252627263
                   },
                   {
                     "ability_id": 26002154
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": "Early melee cancel"
                   },
                   {
                     "ability_id": 465043967
                   },
                   {
                     "ability_id": 3190916303
                   }
                 ],
                 "name": "Melee Cancel",
                 "width": 769.0,
                 "height": 145.0,
                 "description": "It''s fun but gimmicky | Become FAT ELVIS "
               }
             ]
           },
           "hero_id": 19,
           "version": 13,
           "language": 0,
           "description": "CATCH! BLEED! KNIFE OUT! SOFTENING EM UP! LET''S PLAY! YOU''RE GONNA BLEED! BLADES! STICK! STICKIN EM! BLADES OUT! THROWING BLADES! I SEE YOU!",
           "hero_build_id": 167348,
           "origin_build_id": 0,
           "author_account_id": 276521562,
           "last_updated_timestamp": 1732698277
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (17, 159232, 1, 205032437, 0, 0, 0, '2024-11-19 00:20:11.000000', '{
         "hero_build": {
           "name": "ZealousVT Hybrid Talon Build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 3399065363
                   }
                 ],
                 "name": "EARLY GAME",
                 "width": 342.0,
                 "height": 422.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 1144549437
                   },
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 393974127
                   }
                 ],
                 "name": "After Laning Phase",
                 "width": 337.0,
                 "height": 421.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 1102081447
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 2064029594
                   }
                 ],
                 "name": "After Mid-Boss Spawn",
                 "width": 340.0,
                 "height": 542.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 869090587
                   },
                   {
                     "ability_id": 2226497419
                   }
                 ],
                 "name": "Late Game",
                 "width": 340.0,
                 "height": 19.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 1644605047
                   }
                 ],
                 "name": "As Needed:",
                 "width": 236.0,
                 "height": 140.0
               }
             ]
           },
           "hero_id": 17,
           "version": 1,
           "language": 0,
           "description": "My Build I use as Of 11/18/24",
           "hero_build_id": 159232,
           "origin_build_id": 0,
           "author_account_id": 205032437,
           "last_updated_timestamp": 1731975611
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (8, 35977, 2, 1019769024, 1, 0, 0, '2024-09-08 08:17:33.000000', '{
         "hero_build": {
           "name": "Easy McGinnis build. easy Af",
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
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   }
                 ],
                 "name": "Dmg picks",
                 "width": 478.0,
                 "height": 103.0,
                 "description": "Early Game"
               },
               {
                 "mods": [
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   }
                 ],
                 "name": "Heal Picks",
                 "width": 506.0,
                 "height": 157.0,
                 "description": "Early Game"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
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
                     "ability_id": 84321454,
                     "annotation": null
                   }
                 ],
                 "name": "Early mid Game",
                 "width": 724.0,
                 "height": 152.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game picks",
                 "width": 979.0,
                 "height": 148.0,
                 "description": "sell rapid rounds if needed + Armour"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   }
                 ],
                 "name": "Get Ready For End Game",
                 "width": 492.0,
                 "height": 84.0,
                 "description": "spirit items to get u more dmg "
               },
               {
                 "mods": [
                   {
                     "ability_id": 1055679805,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   }
                 ],
                 "name": "If U got cash",
                 "width": 470.0,
                 "height": 136.0,
                 "description": null
               }
             ]
           },
           "hero_id": 8,
           "version": 2,
           "language": 0,
           "description": "Simple build.\nGet more dmg and more heal from your spam gun. Quciksilver to your turret. \nIt will make reloading ez and fast af boi.",
           "hero_build_id": 35977,
           "origin_build_id": 0,
           "author_account_id": 1019769024,
           "last_updated_timestamp": 1725783453
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (7, 126157, 1, 311408234, 1, 0, 0, '2024-10-23 19:55:22.000000', '{
         "hero_build": {
           "name": "[pokerFace] gungungun",
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
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   }
                 ],
                 "name": "early",
                 "width": 336.0,
                 "height": 407.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   }
                 ],
                 "name": "skrappa",
                 "width": 230.0,
                 "height": 401.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
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
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "h3lf",
                 "width": 445.0,
                 "height": 411.0,
                 "description": "as needed       sped++  "
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   }
                 ],
                 "name": "big dmg",
                 "width": 1054.0,
                 "height": 119.0,
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
                     "ability_id": 2480592370,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "big money",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 7,
           "version": 1,
           "language": 0,
           "description": "BANG",
           "hero_build_id": 126157,
           "origin_build_id": 4,
           "author_account_id": 311408234,
           "last_updated_timestamp": 1729713322
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (11, 83416, 7, 162276919, 0, 0, 0, '2024-09-30 22:00:17.000000', '{
         "hero_build": {
           "name": "sj6 dynamo",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
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
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
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
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   }
                 ],
                 "name": "500",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 2956256701,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   }
                 ],
                 "name": "1250",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   }
                 ],
                 "name": "3000",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "6300",
                 "width": 348.0,
                 "height": 173.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
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
                 "name": "sit",
                 "width": 673.0,
                 "height": 110.0,
                 "description": null
               }
             ]
           },
           "hero_id": 11,
           "version": 7,
           "language": 0,
           "description": "hydration copy",
           "hero_build_id": 83416,
           "origin_build_id": 0,
           "author_account_id": 162276919,
           "last_updated_timestamp": 1727733617
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (25, 124391, 1, 291535160, 2, 0, 0, '2024-10-22 15:25:52.000000', '{
         "hero_build": {
           "name": "Boofalo Warden heeheehoohoo",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   }
                 ],
                 "name": "1 main",
                 "width": 673.5,
                 "height": 138.0,
                 "description": "quicksilver to 1"
               },
               {
                 "mods": [
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   }
                 ],
                 "name": "(1 extras)",
                 "width": 345.0,
                 "height": 124.5,
                 "description": "sell when need slots"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   }
                 ],
                 "name": "2 main",
                 "width": 674.25,
                 "height": 130.5,
                 "description": "Tank or Super Prison Mode"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "Long Prison Mode",
                 "width": 348.75,
                 "height": 170.25,
                 "description": "bullet resist sell if need"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 865958998,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   }
                 ],
                 "name": "3 Main",
                 "width": 670.5,
                 "height": 137.25,
                 "description": "Viel Walker if playing w da fog/ reducer if need"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   }
                 ],
                 "name": "Long Prison Mode",
                 "width": 354.0,
                 "height": 149.25,
                 "description": "reach/duration on 3"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "4 Main ",
                 "width": 468.0,
                 "height": 147.0,
                 "description": "situational to each game"
               },
               {
                 "mods": [
                   {
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 2800629741,
                     "annotation": null
                   }
                 ],
                 "name": "Racked up extras",
                 "width": 545.25,
                 "height": 137.25,
                 "description": "Prison Mode Extras"
               }
             ]
           },
           "hero_id": 25,
           "version": 1,
           "language": 0,
           "description": "Tank and Super Extended Prison heeheehoohoo",
           "hero_build_id": 124391,
           "origin_build_id": 0,
           "author_account_id": 291535160,
           "last_updated_timestamp": 1729610752
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (18, 130477, 2, 137909364, 0, 0, 0, '2024-10-26 03:26:16.000000', '{
         "hero_build": {
           "name": "llm",
           "details": {
             "ability_order": {},
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3862866912
                   },
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 968099481
                   }
                 ],
                 "name": "500",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2081037738
                   }
                 ],
                 "name": "1250",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687
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
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 865958998
                   }
                 ],
                 "name": "3000",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2407781327
                   },
                   {
                     "ability_id": 2800629741
                   }
                 ],
                 "name": "6200",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 18,
           "version": 2,
           "language": 6,
           "description": "llmzy",
           "hero_build_id": 130477,
           "origin_build_id": 0,
           "author_account_id": 137909364,
           "last_updated_timestamp": 1729913176
         },
         "rollup_category": 4
       }', 6, 0, 4),
       (7, 128911, 1, 378067196, 0, 0, 0, '2024-10-25 08:50:19.000000', '{
         "hero_build": {
           "name": "Rattle Em'' Boys!",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
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
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 381961617,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   }
                 ],
                 "name": "Early Game",
                 "width": 1074.0,
                 "height": 155.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game",
                 "width": 1059.0,
                 "height": 104.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
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
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game",
                 "width": 1094.0,
                 "height": 145.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1055679805,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   }
                 ],
                 "name": "Extra",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 7,
           "version": 1,
           "language": 0,
           "description": "GUN",
           "hero_build_id": 128911,
           "origin_build_id": 1,
           "author_account_id": 378067196,
           "last_updated_timestamp": 1729846219
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (6, 123963, 4, 18373975, 1, 0, 0, '2024-10-31 08:48:16.000000', '{
         "hero_build": {
           "name": "Underplow''s Abrams",
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
                   "delta": -1,
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 2
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
                   "delta": -2,
                   "ability_id": 2824119765,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
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
                   "delta": -5,
                   "ability_id": 509856396,
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
                   "delta": -5,
                   "ability_id": 715762406,
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
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 465043967,
                     "annotation": null
                   }
                 ],
                 "name": "Early Game",
                 "width": 1055.25,
                 "height": 127.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 26002154,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game",
                 "width": 1126.5,
                 "height": 147.75,
                 "description": "Melee Charge is in testing"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 1252627263,
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
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game",
                 "width": 1200.0,
                 "height": 97.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   }
                 ],
                 "name": "End Game",
                 "width": 1078.5,
                 "height": -53.25,
                 "description": ""
               }
             ]
           },
           "hero_id": 6,
           "version": 4,
           "language": 0,
           "description": "Underplow''s Abrams",
           "hero_build_id": 123963,
           "origin_build_id": 51315,
           "author_account_id": 18373975,
           "last_updated_timestamp": 1730364496
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (3, 201727, 2, 135632144, 0, 0, 0, '2025-02-04 17:47:35.000000', '{
         "hero_build": {
           "name": "Krissy''s Denny''s Maple Syrup",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
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
                     "ability_id": 393974127,
                     "annotation": null
                   }
                 ],
                 "name": "Early Red",
                 "width": 243.0,
                 "height": 310.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   }
                 ],
                 "name": "Early Green",
                 "width": 239.0,
                 "height": 309.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   }
                 ],
                 "name": "Early Purple",
                 "width": 257.0,
                 "height": 309.0,
                 "description": "Imbue QR on 3"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   }
                 ],
                 "name": "Hard Lane/Losing",
                 "width": 233.0,
                 "height": 309.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
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
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Purple",
                 "width": 807.0,
                 "height": 143.0,
                 "description": "Imbue all 3"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "Mid DPS",
                 "width": 187.0,
                 "height": 168.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Green",
                 "width": 233.0,
                 "height": 169.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   }
                 ],
                 "name": "End Game/Luxury",
                 "width": 667.0,
                 "height": 167.0,
                 "description": "Sell HP Ward for SO | Sell bad greens for better greens"
               }
             ]
           },
           "hero_id": 3,
           "version": 2,
           "language": 0,
           "description": "Made for gwoober!! (updated 02/04/2025)",
           "hero_build_id": 201727,
           "origin_build_id": 0,
           "author_account_id": 135632144,
           "last_updated_timestamp": 1738691255
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (8, 161822, 1, 329197644, 1, 0, 0, '2024-11-22 03:55:21.000000', '{
         "hero_build": {
           "name": "Hearts Prime Mcginnis",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2142734020,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3133377790,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2142734020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1725685134,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3503044146,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3133377790,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2142734020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3133377790,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1725685134,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3503044146,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2142734020,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1725685134,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3133377790,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3503044146,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1725685134,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3503044146,
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
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   }
                 ],
                 "name": "Starting Buys",
                 "width": 457.5,
                 "height": 147.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
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
                     "ability_id": 968099481,
                     "annotation": null
                   }
                 ],
                 "name": "Optional Starters",
                 "width": 552.0,
                 "height": 163.5,
                 "description": null
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
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "Beginning Build",
                 "width": 1019.25,
                 "height": 134.25,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 2463960640,
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
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   }
                 ],
                 "name": "Moving Fortress",
                 "width": 1035.0,
                 "height": 301.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   }
                 ],
                 "name": "FLEX / Optional",
                 "width": 1031.25,
                 "height": 137.25,
                 "description": null
               }
             ]
           },
           "hero_id": 8,
           "version": 1,
           "language": 0,
           "description": "Just sharing for a friend to check out and follow",
           "hero_build_id": 161822,
           "origin_build_id": 0,
           "author_account_id": 329197644,
           "last_updated_timestamp": 1732247721
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (48, 151944, 3, 1058282440, 0, 0, 0, '2024-11-11 11:59:53.000000', '{
         "hero_build": {
           "name": "AD爆射流",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 208809857,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 208809857,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4062064977,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3422822440,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2493171901,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 208809857,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 208809857,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3422822440,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4062064977,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3422822440,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3422822440,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4062064977,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4062064977,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2493171901,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2493171901,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2493171901,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "前期",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 865958998
                   },
                   {
                     "ability_id": 2447176615
                   }
                 ],
                 "name": "中期",
                 "width": 1025.0,
                 "height": 295.0
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
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 1282141666
                   }
                 ],
                 "name": "后期",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3361075077
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 1254091416
                   }
                 ],
                 "name": "选出",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 48,
           "version": 3,
           "language": 6,
           "description": "爱来自火影玩家",
           "hero_build_id": 151944,
           "origin_build_id": 0,
           "author_account_id": 1058282440,
           "last_updated_timestamp": 1731326393
         },
         "rollup_category": 4
       }', 6, 0, 4),
       (31, 86211, 1, 135529038, 13, 0, 0, '2024-09-30 22:22:10.000000', '{
         "hero_build": {
           "name": "Grizmot Lash (Tank gun Hydration) ",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 519124136,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 519124136,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3561817145,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2670099061,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3561817145,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 397010810,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2670099061,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 397010810,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
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
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   }
                 ],
                 "name": "Early Game",
                 "width": 1030.0,
                 "height": 151.0,
                 "description": "Left to right usually. Extra Regen only if you need it in lane. Quicksilver Reload on Flog (3)."
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
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
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game",
                 "width": 1027.0,
                 "height": 142.0,
                 "description": "Fill your slots. Improved Burst first T3 item."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 554.0,
                 "height": 163.0,
                 "description": "Antiheal/Anti CC/Anti-Mobility"
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
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game",
                 "width": 471.0,
                 "height": 96.0,
                 "description": "Improved Reach on Death Slam."
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   }
                 ],
                 "name": "Luxury",
                 "width": 1033.0,
                 "height": 144.0,
                 "description": "Buying T4 items in this build is bait, just buy all the upgrades for your T3 items instead. But if really rich consider the following."
               }
             ]
           },
           "hero_id": 31,
           "version": 1,
           "language": 0,
           "description": "Hydrations build with minor edits",
           "hero_build_id": 86211,
           "origin_build_id": 17517,
           "author_account_id": 135529038,
           "last_updated_timestamp": 1727734930
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 13,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (25, 135928, 2, 31907077, 0, 0, 0, '2024-11-01 00:38:34.000000', '{
         "hero_build": {
           "name": "Мой Дозорный Grebublin",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": "Живительный выстрел"
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": "Алхимическая колба"
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 2095565695
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": "Берсерк"
                   }
                 ],
                 "name": "Основа",
                 "width": 446.0,
                 "height": 418.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3862866912
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 865958998
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "Сковывающие слово"
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": "Последний бой"
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": "Скоростная стойкость"
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": "Боевой барьер"
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": "Акивная перезарядка"
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": "Барьер заклинателя"
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": "Незримый покров"
                   }
                 ],
                 "name": "Доп",
                 "width": 553.0,
                 "height": 418.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 393974127
                   },
                   {
                     "ability_id": 3133167885
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "Последний бой"
                   },
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 2037039379
                   }
                 ],
                 "name": "Бонус",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 25,
           "version": 2,
           "language": 8,
           "description": " Grebublin",
           "hero_build_id": 135928,
           "origin_build_id": 0,
           "author_account_id": 31907077,
           "last_updated_timestamp": 1730421514
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (6, 109359, 30, 917132649, 0, 0, 0, '2024-11-08 01:13:59.000000', '{
         "hero_build": {
           "name": "아오오니",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 715762406,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4072270083,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4072270083,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2824119765,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2824119765,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4072270083,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 509856396,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 715762406,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 715762406,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 715762406,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4072270083,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1437614329
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 26002154
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 754480263
                   }
                 ],
                 "name": "라인전",
                 "width": 1028.0,
                 "height": 159.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1414319208
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": "밸브님이 생명 칸 하나 더만들어줌"
                   },
                   {
                     "ability_id": 2481177645
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 2447176615
                   }
                 ],
                 "name": "초중반",
                 "width": 340.0,
                 "height": 303.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 1252627263
                   },
                   {
                     "ability_id": 1102081447
                   }
                 ],
                 "name": "코어",
                 "width": 336.0,
                 "height": 305.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3144988365
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 1371725689
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   }
                 ],
                 "name": "필요시",
                 "width": 338.0,
                 "height": 299.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2095565695
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 2407781327
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 1055679805
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 4003032160
                   }
                 ],
                 "name": "6번째 카테고리",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 6,
           "version": 30,
           "language": 4,
           "description": "실험용\n",
           "hero_build_id": 109359,
           "origin_build_id": 106694,
           "author_account_id": 917132649,
           "last_updated_timestamp": 1731028439
         },
         "rollup_category": 4
       }', 4, 0, 4),
       (15, 5620, 2, 857348976, 1, 0, 0, '2024-08-17 09:45:54.000000', '{
         "hero_build": {
           "name": " сборка для Бибоп",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2521902222,
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
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 465043967,
                     "annotation": null
                   }
                 ],
                 "name": "stage 1",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 1252627263,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   }
                 ],
                 "name": "stage2",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2480592370,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "stage 3",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 15,
           "version": 2,
           "language": 0,
           "description": "fun",
           "hero_build_id": 5620,
           "origin_build_id": 0,
           "author_account_id": 857348976,
           "last_updated_timestamp": 1723887954
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (31, 191161, 7, 1072458252, 0, 0, 0, '2025-01-19 10:29:47.000000', '{
         "hero_build": {
           "name": "fml",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2670099061,
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
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 395867183
                   },
                   {
                     "ability_id": 2829638276
                   }
                 ],
                 "name": "Early",
                 "width": 1034.0,
                 "height": 167.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 1976391348
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 1235347618
                   }
                 ],
                 "name": "Mid",
                 "width": 340.0,
                 "height": 296.5,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1932939246
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 865958998
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 4003032160
                   },
                   {
                     "ability_id": 3261353684
                   }
                 ],
                 "name": "Mid-Late",
                 "width": 337.0,
                 "height": 298.5,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 787198704
                   }
                 ],
                 "name": "Late gun",
                 "width": 345.0,
                 "height": 303.0,
                 "description": "you can go more gun or more spirit, choose wisely"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 869090587
                   }
                 ],
                 "name": "Late spirit",
                 "width": 348.0,
                 "height": 299.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 600033864
                   },
                   {
                     "ability_id": 619484391
                   }
                 ],
                 "name": "Situational",
                 "width": 235.0,
                 "height": 301.0
               }
             ]
           },
           "hero_id": 31,
           "version": 7,
           "language": 0,
           "description": "ye",
           "hero_build_id": 191161,
           "origin_build_id": 88567,
           "author_account_id": 1072458252,
           "last_updated_timestamp": 1737282587
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (14, 155689, 11, 1535399261, 4612, 0, 0, '2025-01-19 00:19:02.000000', '{
         "hero_build": {
           "name": "Counter-Strike Cowgirl Headshot Build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 4179229681,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1235098866,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4179229681,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2240607294,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 4179229681,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1235098866,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2240607294,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4179229681,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3190606822,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1235098866,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1235098866,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2240607294,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3190606822,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2240607294,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3190606822,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3190606822,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": "Buy first if poke-heavy lane"
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": "Sell for slots."
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": "huge item for Holliday, extra ammo + a little boost of spirit and health"
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": "Stamina synergizes with our 2."
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": "Most importantly, this gives us a extra bounce pad for mobility purposes."
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 1998374645
                   }
                 ],
                 "name": "Laning Phase",
                 "width": 565.0,
                 "height": 299.0,
                 "description": "Buy as needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": "my usual pick"
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": "If behind, or secured a kill and need a heal to stay in lane."
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 1235347618
                   }
                 ],
                 "name": "Lane Optionals",
                 "width": 419.0,
                 "height": 297.0,
                 "description": "Sell later (except reach)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235,
                     "annotation": "We are squishy and want to stick to mid-range engagements. This will help us do that."
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": "Not too much help early on, but later it will be instrumental for us as our damage scales."
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": "Place this on Barrels. "
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": "Some early sustain"
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": "You can sell this later if you want both Spirit AND Bullet Armour, or replace it with Warp Stone"
                   }
                 ],
                 "name": "Post-Lane",
                 "width": 595.0,
                 "height": 177.0,
                 "description": "Focus on farming these and core items. "
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3585132399
                   }
                 ],
                 "name": "Mid-Game Sustain",
                 "width": 431.0,
                 "height": 175.0,
                 "description": "Optional/Situational"
               },
               {
                 "mods": [
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": "It may seem early to buy this, but having tested extensively, the power spike you get is stronger the earlier you can pick it up. This gives a strong midgame position."
                   },
                   {
                     "ability_id": 2152872419,
                     "annotation": "A fairly respectable power spike at mid-range on this item"
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": "This helps our mobility/evasion, and our perpetual ammunition troubles by buffing our slides. "
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": "Adds slows, more damage, health and ammo. This + Inhib are our main t4 items."
                   },
                   {
                     "ability_id": 2037039379
                   }
                 ],
                 "name": "Core Items",
                 "width": 614.0,
                 "height": 303.0,
                 "description": "Core items on the build, generally go in order."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3140772621
                   }
                 ],
                 "name": "Super-Late",
                 "width": 394.0,
                 "height": 302.0,
                 "description": "As necessary."
               },
               {
                 "mods": [
                   {
                     "ability_id": 3731635960,
                     "annotation": "Pretty situational but can help us out against a fed Infernus, Pocket ults, a debuff active spamming Paradox, etc.  "
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 1371725689
                   }
                 ],
                 "name": "Situational",
                 "width": 1016.0,
                 "height": 173.0,
                 "description": "Buy as needed (Warpstone + Phantom = troll combo on your maxxed 2 stun)"
               }
             ]
           },
           "hero_id": 14,
           "version": 11,
           "language": 0,
           "description": "Headshot orientated build meant for single-target damage at mid range. Some minor adjustments in light of the change to her crackshot have been made since her official release. \nAbility point order is agnostic, do what you will with them. \n\nBuild by Sax0n. ",
           "hero_build_id": 155689,
           "origin_build_id": 0,
           "author_account_id": 1535399261,
           "last_updated_timestamp": 1737245942
         },
         "num_favorites": 4612,
         "rollup_category": 1
       }', 0, 0, 1),
       (1, 223126, 1, 1566311584, 0, 0, 0, '2025-04-05 03:46:45.000000', '{
         "hero_build": {
           "name": "[[[[Honz]鸿仔Honz的不知火舞]的副本]的副本]的副本",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -5,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   }
                 ],
                 "name": "前期",
                 "width": 447.0,
                 "height": 296.0,
                 "description": "小灵力前期加强战斗力 后期卖"
               },
               {
                 "mods": [
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   }
                 ],
                 "name": "补绿格子 自己选 ",
                 "width": 447.0,
                 "height": 296.0,
                 "description": " 吸血+治疗强化=吸血蝗"
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 4075861416,
                     "annotation": null
                   }
                 ],
                 "name": "选出增强前期战斗力",
                 "width": 72.0,
                 "height": 295.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 2480592370,
                     "annotation": null
                   },
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   }
                 ],
                 "name": "类别 5",
                 "width": 1024.0,
                 "height": 145.0,
                 "description": "先点满跑火就第一件3000电池 点满点燃就出毒弹"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   }
                 ],
                 "name": "可补",
                 "width": 1009.0,
                 "height": 151.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 1,
           "version": 1,
           "language": 6,
           "description": "123",
           "hero_build_id": 223126,
           "origin_build_id": 48,
           "author_account_id": 1566311584,
           "last_updated_timestamp": 1743824805
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": null,
         "rollup_category": 4,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 6, 0, 4),
       (7, 94672, 3, 52147993, 0, 0, 0, '2024-10-05 05:03:25.000000', '{
         "hero_build": {
           "name": "Sekade, Wraith Gun build",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
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
                     "ability_id": 968099481,
                     "annotation": null
                   }
                 ],
                 "name": "first laning phase",
                 "width": 901.0,
                 "height": 291.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 2956256701,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
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
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   }
                 ],
                 "name": "mid game",
                 "width": 1044.0,
                 "height": 349.0,
                 "description": "Sell extra health for debuf/ sell basic mag for slowing bullets"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3133167885,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 865958998,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   }
                 ],
                 "name": "end game",
                 "width": 1042.0,
                 "height": 456.9857177734375,
                 "description": "sell health nova for veil walker/ sell headhunter for crippling headshot/Sell head hunter for cirppling head/sell Enduring spirit for leech"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "flex slot",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 7,
           "version": 3,
           "language": 0,
           "description": "Easy to follow all round good warith build, high damage, High HP\nand high spirit damage.\n\nDid a mention easy to follow. Good for beginners or people who like to frag.",
           "hero_build_id": 94672,
           "origin_build_id": 8,
           "author_account_id": 52147993,
           "last_updated_timestamp": 1728104605
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (1, 213590, 1, 76992924, 4, 0, 0, '2025-03-09 20:27:48.000000', '{
         "hero_build": {
           "name": "Burning Infernus",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1593133799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 491391007,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3516947824,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1142270357,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": "Your fire rate sucks. This helps."
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
                     "ability_id": 1548066885,
                     "annotation": "Good for early harassment + titanic in late"
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": "Free T1 for your oil"
                   }
                 ],
                 "name": "Early game required",
                 "width": 1006.5,
                 "height": 145.5,
                 "description": "buy all"
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
                     "annotation": "1st powerspike, great for early game kills"
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": "Huge lifesteal"
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": "2nd powerspike, you can now farm jungle much faster"
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   }
                 ],
                 "name": "Mid-game",
                 "width": 1025.25,
                 "height": 144.0,
                 "description": "Left to Right  (Almost always buy all)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": "This is your biggest damage spike, you can start picking and winning fights. Get this first because your fire rate sucks!"
                   },
                   {
                     "ability_id": 2480592370,
                     "annotation": "Teamfight contribution goes up here, get leech first if you''re struggling to stay alive and focus singular targets"
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   }
                 ],
                 "name": "TURN UP THE HEAT",
                 "width": 450.0,
                 "height": 186.75,
                 "description": "BUY ALL! read annos"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2356412290,
                     "annotation": "ULTRASHOOT"
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": "UNKILLABLE LIFESTEAL"
                   },
                   {
                     "ability_id": 4075861416,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   }
                 ],
                 "name": "Late game",
                 "width": 567.0,
                 "height": 180.75,
                 "description": "Not necessary to buy all. Buy as needed (read annotations)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3731635960,
                     "annotation": "anti-pocket"
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": "anti-haze/wraith"
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": "anti-lash"
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
                     "ability_id": 3357231760,
                     "annotation": "general anti-cc"
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": "anti-bebop"
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   }
                 ],
                 "name": "Defense",
                 "width": 575.25,
                 "height": 403.5,
                 "description": "As needed (read annotations)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   }
                 ],
                 "name": "Ultra Lategame Luxury",
                 "width": 445.5,
                 "height": 306.0,
                 "description": "only if game is running super late and all other items you have"
               }
             ]
           },
           "hero_id": 1,
           "version": 1,
           "language": 0,
           "description": "LET''EM BURN!!!",
           "hero_build_id": 213590,
           "origin_build_id": 167744,
           "author_account_id": 76992924,
           "last_updated_timestamp": 1741552068
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 4,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (31, 162126, 112, 433904459, 0, 0, 0, '2024-12-28 23:42:05.000000', '{
         "hero_build": {
           "name": "Transporter",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2670099061,
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
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 395867183
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 3970837787
                   }
                 ],
                 "name": "Build",
                 "width": 985.37146,
                 "height": 152.22858,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1976391348
                   },
                   {
                     "ability_id": 600033864
                   },
                   {
                     "ability_id": 1932939246
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": "instead of headshot"
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 334300056
                   }
                 ],
                 "name": "cooldown, reach in ult",
                 "width": 985.37146,
                 "height": 149.14285,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3357231760,
                     "annotation": "instead of silence or cold front"
                   },
                   {
                     "ability_id": 2820116164
                   }
                 ],
                 "name": "1/2",
                 "width": 228.34286,
                 "height": 147.08572
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 1282141666
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 339443430
                   }
                 ],
                 "name": "",
                 "width": 796.1143,
                 "height": 150.17143
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 1644605047
                   }
                 ],
                 "name": "Optional",
                 "width": 445.37143,
                 "height": 165.6
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 2971868509
                   }
                 ],
                 "name": "4th flex",
                 "width": 336.34286,
                 "height": 146.05714,
                 "description": "1/3"
               }
             ]
           },
           "hero_id": 31,
           "version": 112,
           "language": 0,
           "description": "oses",
           "hero_build_id": 162126,
           "origin_build_id": 21723,
           "author_account_id": 433904459,
           "last_updated_timestamp": 1735429325
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (8, 183480, 1, 112692816, 0, 0, 0, '2024-12-24 03:42:04.000000', '{
         "hero_build": {
           "name": "1v1ginnis",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 381961617,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   }
                 ],
                 "name": "Lane",
                 "width": 562.0,
                 "height": 150.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   }
                 ],
                 "name": "Maybes",
                 "width": 444.0,
                 "height": 131.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   }
                 ],
                 "name": "Core + Armors",
                 "width": 1017.0000610351562,
                 "height": 137.25001525878906,
                 "description": "Armor just there for quick access, don''t need to buy "
               },
               {
                 "mods": [
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 2481177645,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 3133167885,
                     "annotation": null
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": null
                   },
                   {
                     "ability_id": 1113837674,
                     "annotation": null
                   }
                 ],
                 "name": "Later Core",
                 "width": 670.0,
                 "height": 147.0,
                 "description": "Vampiric/silencer in whichever order you need"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "Spirit Luxuries",
                 "width": 340.0,
                 "height": 147.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379,
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
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   }
                 ],
                 "name": "Luxuries",
                 "width": 996.0,
                 "height": 306.42864990234375,
                 "description": "Usually just inhib/armor/leech/lucky"
               }
             ]
           },
           "hero_id": 8,
           "version": 1,
           "language": 0,
           "description": "get good",
           "hero_build_id": 183480,
           "origin_build_id": 3,
           "author_account_id": 112692816,
           "last_updated_timestamp": 1735011724
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (17, 128131, 3, 100473561, 0, 0, 0, '2024-10-25 00:08:31.000000', '{
         "hero_build": {
           "name": "Aloidis Gun",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "annotation": "",
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": ""
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": ""
                   }
                 ],
                 "name": "early",
                 "width": 1024,
                 "height": 162,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2152872419,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": ""
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": ""
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": ""
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": ""
                   }
                 ],
                 "name": "mid",
                 "width": 1028,
                 "height": 165,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1396247347,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": ""
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": ""
                   }
                 ],
                 "name": "late",
                 "width": 1033,
                 "height": 149,
                 "description": ""
               }
             ]
           },
           "hero_id": 17,
           "version": 3,
           "language": 0,
           "description": "asd",
           "hero_build_id": 128131,
           "origin_build_id": 110336,
           "author_account_id": 100473561,
           "last_updated_timestamp": 1729814911
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (20, 172639, 71, 874339019, 0, 0, 0, '2024-12-04 15:29:04.000000', '{
         "hero_build": {
           "name": "Gun (Gineticus)",
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
                   "delta": -5,
                   "ability_id": 3642273386,
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
                     "ability_id": 1548066885
                   },
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 811521119
                   },
                   {
                     "ability_id": 381961617
                   }
                 ],
                 "name": "",
                 "width": 230.25,
                 "height": 297.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3713423303
                   }
                 ],
                 "name": "",
                 "width": 231.0,
                 "height": 297.75
               },
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 380806748
                   }
                 ],
                 "name": "",
                 "width": 231.0,
                 "height": 297.75
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "",
                 "width": 109.5,
                 "height": 298.5,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1282141666
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 2922054143
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 2356412290
                   }
                 ],
                 "name": "",
                 "width": 553.5,
                 "height": 150.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2108215830
                   },
                   {
                     "ability_id": 2463960640
                   }
                 ],
                 "name": "",
                 "width": 337.5,
                 "height": 136.5
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
                     "ability_id": 619484391
                   },
                   {
                     "ability_id": 2480592370
                   },
                   {
                     "ability_id": 365620721
                   },
                   {
                     "ability_id": 2617435668
                   }
                 ],
                 "name": "",
                 "width": 342.0,
                 "height": 302.22647
               },
               {
                 "mods": [
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 1378931225
                   }
                 ],
                 "name": "",
                 "width": 123.0,
                 "height": 300.75
               },
               {
                 "mods": [
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 3261353684
                   }
                 ],
                 "name": "",
                 "width": 338.25,
                 "height": 299.25
               }
             ]
           },
           "hero_id": 20,
           "version": 71,
           "language": 0,
           "description": "Gineticus gun ivy build",
           "hero_build_id": 172639,
           "origin_build_id": 3,
           "author_account_id": 874339019,
           "last_updated_timestamp": 1733326144
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (1, 188983, 1, 71837170, 0, 0, 0, '2025-01-06 12:31:51.000000', '{
         "hero_build": {
           "name": "ИНФЕРНУУС Krabs",
           "details": {
             "ability_order": {},
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 1797283378
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 3776945997
                   }
                 ],
                 "name": "Категория 1",
                 "width": 1030.0,
                 "description": "Krabs"
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 3696726732
                   }
                 ],
                 "name": "Категория 2",
                 "width": 664.0,
                 "height": 170.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3357231760
                   }
                 ],
                 "name": "Пэрим лэш и тд",
                 "width": 354.0,
                 "height": 148.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 2081037738
                   }
                 ],
                 "name": "Категория 4",
                 "width": 1030.0,
                 "description": "Продаем спешную стрельбу"
               }
             ]
           },
           "hero_id": 1,
           "version": 1,
           "language": 8,
           "description": "Krabs",
           "hero_build_id": 188983,
           "origin_build_id": 0,
           "author_account_id": 71837170,
           "last_updated_timestamp": 1736166711
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (19, 174388, 1, 1164912611, 5, 0, 0, '2024-12-07 06:42:58.000000', '{
         "hero_build": {
           "name": "Shiv Knife & Gun Build",
           "details": {
             "ability_order": {
               "currency_changes": [
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
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
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
                   "ability_id": 1835738020,
                   "annotation": null,
                   "currency_type": 2
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
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
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
                   "ability_id": 1458044103,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   }
                 ],
                 "name": "Errrrr",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2481177645,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 1030.0,
                 "height": null,
                 "description": "After you get first two items, start roaming and try to takes ones"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 1113837674,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 1036.0,
                 "height": 148.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   }
                 ],
                 "name": "",
                 "width": 1030.0,
                 "height": null,
                 "description": "Options - Alc flask is great for build exposure and gun damage"
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 0,
           "description": "Pro Shiv..",
           "hero_build_id": 174388,
           "origin_build_id": 0,
           "author_account_id": 1164912611,
           "last_updated_timestamp": 1733553778
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 5,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (3, 40909, 1, 110148677, 0, 0, 0, '2024-09-10 11:06:02.000000', '{
         "hero_build": {
           "name": "Seejae''s Vindicta",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
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
                     "ability_id": 1235347618,
                     "annotation": null
                   }
                 ],
                 "name": "Midgame",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2152872419,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
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
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 1798666702,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 1083.0001220703125,
                 "height": 297.0000305175781,
                 "description": null
               }
             ]
           },
           "hero_id": 3,
           "version": 1,
           "language": 0,
           "description": "Vindicta",
           "hero_build_id": 40909,
           "origin_build_id": 0,
           "author_account_id": 110148677,
           "last_updated_timestamp": 1725966362
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (13, 170490, 1, 81187023, 0, 0, 0, '2024-12-01 10:39:52.000000', '{
         "hero_build": {
           "name": "alterpub: max fire rate",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 1150006784,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 1042.5,
                 "height": 349.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   }
                 ],
                 "name": "Category 2",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   }
                 ],
                 "name": "situationally",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 13,
           "version": 1,
           "language": 0,
           "description": "roflo build",
           "hero_build_id": 170490,
           "origin_build_id": 0,
           "author_account_id": 81187023,
           "last_updated_timestamp": 1733049592
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (20, 120608, 2, 453268859, 0, 0, 0, '2024-10-20 23:53:21.000000', '{
         "hero_build": {
           "name": "Ivy B-21",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 4111222521,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3642273386,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1531378655,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4111222521,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1247583368,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 4111222521,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4111222521,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3642273386,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1531378655,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1247583368,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1247583368,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1247583368,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3642273386,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3642273386,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1531378655,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1531378655,
                   "annotation": "",
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3862866912,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": ""
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": ""
                   }
                 ],
                 "name": "Category 1",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": ""
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": ""
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": ""
                   }
                 ],
                 "name": "Category 2",
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
                     "ability_id": 3612042342,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": ""
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": ""
                   }
                 ],
                 "name": "Category 3",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               }
             ]
           },
           "hero_id": 20,
           "version": 2,
           "language": 0,
           "description": "This is MY build I claim COPYRIGHT on this build because its the BEST BUILD",
           "hero_build_id": 120608,
           "origin_build_id": 112528,
           "author_account_id": 453268859,
           "last_updated_timestamp": 1729468401
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (25, 84653, 8, 132742733, 0, 0, 0, '2024-09-30 08:19:14.000000', '{
         "hero_build": {
           "name": "3/Binding Word/Crane/Clamp enjoyer(untested again)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   }
                 ],
                 "name": "left -> right (500)",
                 "width": 586.0,
                 "height": 158.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "left->right(1250-3000)",
                 "width": 688.0,
                 "height": 306.0,
                 "description": "Knockdown to actually make 3 workable"
               },
               {
                 "mods": [
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   }
                 ],
                 "name": "Echo will be peak double Clamp. Get it if you have 6200",
                 "width": 259.0,
                 "height": 295.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 865958998,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   }
                 ],
                 "name": "left -> right (3000-6200)",
                 "width": 1021.0,
                 "height": 145.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1798666702,
                     "annotation": null
                   }
                 ],
                 "name": "Shadow Weave replace High-Velocity Mag",
                 "width": 295.0,
                 "height": 149.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   }
                 ],
                 "name": "",
                 "width": 202.0,
                 "height": 151.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   }
                 ],
                 "name": "when game doesnt end",
                 "width": 429.0,
                 "height": 238.515625,
                 "description": "Replace head with head"
               }
             ]
           },
           "hero_id": 25,
           "version": 8,
           "language": 0,
           "description": "bruh. Last Stand for farming",
           "hero_build_id": 84653,
           "origin_build_id": 0,
           "author_account_id": 132742733,
           "last_updated_timestamp": 1727684354
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (15, 165362, 2, 160128987, 10, 0, 0, '2024-11-25 00:17:33.000000', '{
         "hero_build": {
           "name": "Bebop 1v1 gun build with lifesteal",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2521902222,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1928108461,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3089858203,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3832675871,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2521902222,
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
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   }
                 ],
                 "name": "Laning phase",
                 "width": 775.0,
                 "height": 149.0,
                 "description": "Bullet lifesteal as soon as possible (4th-6th item)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   }
                 ],
                 "name": "Buy when must",
                 "width": 235.0,
                 "height": 143.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   }
                 ],
                 "name": "After lane damage",
                 "width": 453.0,
                 "height": 163.0,
                 "description": "Buy (usually) in order"
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   }
                 ],
                 "name": "After lane other",
                 "width": 340.0,
                 "height": 149.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "Hook",
                 "width": 208.0,
                 "height": 160.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   }
                 ],
                 "name": "Resistance and health",
                 "width": 558.0,
                 "height": 173.0,
                 "description": "When needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   }
                 ],
                 "name": "Mid game 1v1",
                 "width": 454.0,
                 "height": 161.0,
                 "description": "Leech first!"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   }
                 ],
                 "name": "Late game damage",
                 "width": 498.0,
                 "height": 152.0,
                 "description": "Buy according to situation"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   }
                 ],
                 "name": "Maybe",
                 "width": 134.0,
                 "height": 152.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 2800629741,
                     "annotation": null
                   }
                 ],
                 "name": "When having fun",
                 "width": 379.0,
                 "height": 97.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   }
                 ],
                 "name": "Patron defend ",
                 "width": 1030.0,
                 "height": null,
                 "description": "Items for ult when defending patron from waves and enemy heroes"
               }
             ]
           },
           "hero_id": 15,
           "version": 2,
           "language": 0,
           "description": "Very effective bebop build for 1v1s and hooking enemies for the team.\n\nLaning phase should be played relatively safe killing minions \nand always securing souls. Also try to steal enemy souls as much as \npossible as it is insanely easy with bebops gun.\nWhen hook, bomb and uppercut available, try to hook near friendly\nguardian, apply bomb and uppercut towards the guardian.",
           "hero_build_id": 165362,
           "origin_build_id": 0,
           "author_account_id": 160128987,
           "last_updated_timestamp": 1732493853
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 10,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (52, 136224, 21, 150009979, 36, 0, 0, '2024-10-29 18:37:14.000000', '{
         "hero_build": {
           "name": "Riku''s Gun Mirage",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": "go before head hunter if you are trying to kill someone with escape (set up tornado)"
                   }
                 ],
                 "name": "Lane",
                 "width": 772.5,
                 "height": 157.5,
                 "description": "Big damage spike at Headhunter"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Optional Healing",
                 "width": 246.0,
                 "height": 148.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": "just spam off cd lol"
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 1028.25,
                 "height": 144.75,
                 "description": "Really good rundown/chase potential"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3696726732,
                     "annotation": "Buy instantly against good healing comps"
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": "OP team utility, buy when your team doesn''t have an inhibitor applicator"
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": "When they have a lot of resists, otherwise skip (take into account your 37% bullet resist remover)"
                   },
                   {
                     "ability_id": 2480592370,
                     "annotation": "Apply your debuffs to multiple people instantly"
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": "can rush against heavy spirit teams after 1 6300"
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": "can rush against heavy bullet teams after 1 6300"
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "good for shutting down ppl who like to run it down - haze, yamato, lash, etc"
                   }
                 ],
                 "name": "Late",
                 "width": 1030.0,
                 "height": null,
                 "description": "All situational - read annotations, L - > R general prio, imp armors whenever you feel like you want more tankiness"
               },
               {
                 "mods": [
                   {
                     "ability_id": 630839635,
                     "annotation": "on 1 for dbl nado "
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": "Good option for when you want to replace your purples super late"
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": "useful for shiv bleed/pocket ult, usually imp spirit armor is enough for pocket ult tho "
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": "50k+ souls"
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 3133167885,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": "biggest damage buff in this whole section"
                   }
                 ],
                 "name": "Situational",
                 "width": 1032.0,
                 "height": 156.75,
                 "description": "Most likely will only buy debuff remover"
               }
             ]
           },
           "hero_id": 52,
           "version": 21,
           "language": 0,
           "description": "Heavy emphasis on ganking as much as possible, split pushing is best if you can reliably 1v1, otherwise you can just push out lanes and tp\nETERNUS BTW\nsiphon bullets is bad dont buy it trust",
           "hero_build_id": 136224,
           "origin_build_id": 124040,
           "author_account_id": 150009979,
           "last_updated_timestamp": 1730227034
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 36,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (16, 197025, 1, 94709526, 3, 0, 0, '2025-01-22 19:24:56.000000', '{
         "hero_build": {
           "name": "Support Calico (NOT TROLL?!?!?!?)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 4131517918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1426567660,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1009029159,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2054144742,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4131517918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2054144742,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2054144742,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2054144742,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1009029159,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1009029159,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1009029159,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4131517918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1426567660,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1426567660,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4131517918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1426567660,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 968099481,
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
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": "Steal camps, clear waves"
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Laning",
                 "width": 556.5,
                 "height": 291.75,
                 "description": "Cold front is CORE"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": "Sprint across the map in 15 seconds"
                   }
                 ],
                 "name": "Get fleetfoot ASAP",
                 "width": 69.0,
                 "height": 283.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3970837787,
                     "annotation": "Gives cooldown reduction\n"
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   }
                 ],
                 "name": "Early Game Protection",
                 "width": 149.25,
                 "height": 288.75,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2956256701,
                     "annotation": null
                   },
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 1804594021,
                     "annotation": "Rescue anybody"
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game",
                 "width": 612.0,
                 "height": 308.25,
                 "description": "Rush Healing Nova, Torment Pulse, Rescue beam. Section not in order"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": "Optional, if you want to sell combat barrier. Gives speed"
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": "Gives Sprint Speed\n"
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": "TESTING - Gives cooldown for actives"
                   }
                 ],
                 "name": "Late Game Options",
                 "width": 396.75,
                 "height": 308.25,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197,
                     "annotation": "I prefer healing nova/rescue beam"
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2922054143,
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
                     "ability_id": 2617435668,
                     "annotation": null
                   }
                 ],
                 "name": "Other Valid Active Options",
                 "width": 1070.0,
                 "height": 186.0,
                 "description": "If you really need these"
               }
             ]
           },
           "hero_id": 16,
           "version": 1,
           "language": 0,
           "description": "This build is focused on roaming the map and supporting your team. You can show up to any fight using Cat From + Fleet foot and cross the map in 17 seconds. Rescue beam anyone in danger, heal, and sneak in steal camps.",
           "hero_build_id": 197025,
           "origin_build_id": 196232,
           "author_account_id": 94709526,
           "last_updated_timestamp": 1737573896
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 3,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (12, 123630, 3, 154818537, 0, 0, 0, '2024-10-22 00:51:16.000000', '{
         "hero_build": {
           "name": "Why are you hitting yourself slowly?",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2351041382,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 18921423,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 18921423,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3826390464,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3826390464,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1963397252,
                   "annotation": "",
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": ""
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   }
                 ],
                 "name": "First these",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3403085434,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": ""
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": ""
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": ""
                   }
                 ],
                 "name": "Then these",
                 "width": 237,
                 "height": 479,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2951612397,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": ""
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": ""
                   }
                 ],
                 "name": "Then these",
                 "width": 240,
                 "height": 475,
                 "description": "Buy these as flex slots open"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": ""
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2717651715,
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
                     "ability_id": 2064029594,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": ""
                   }
                 ],
                 "name": "Upgrades",
                 "width": 524,
                 "height": 474,
                 "description": ""
               }
             ]
           },
           "hero_id": 12,
           "version": 3,
           "language": 0,
           "description": "Beam build that focuses on running people down and being super fkin annoying",
           "hero_build_id": 123630,
           "origin_build_id": 0,
           "author_account_id": 154818537,
           "last_updated_timestamp": 1729558276
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (13, 212333, 2, 1048683446, 0, 0, 0, '2025-03-06 18:59:36.000000', '{
         "hero_build": {
           "name": "legit good [ULT]",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2414191464,
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
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 3077079169
                   }
                 ],
                 "name": "EARLY -",
                 "width": 352.5,
                 "height": 151.5,
                 "description": "SALE (Basic Mag -> Mystic Shot)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 811521119
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 3270001687
                   }
                 ],
                 "name": "MID -",
                 "width": 340.5,
                 "height": 150.0,
                 "description": "SALE (Rapid -> Burst)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2480592370
                   },
                   {
                     "ability_id": 2226497419
                   }
                 ],
                 "name": "LATE",
                 "width": 250.97144,
                 "height": 159.42857,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 223594321
                   }
                 ],
                 "name": "EARLY",
                 "width": 352.5,
                 "height": 155.25
               },
               {
                 "mods": [
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 2603935618
                   }
                 ],
                 "name": "MID",
                 "width": 339.0,
                 "height": 153.75
               },
               {
                 "mods": [
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 2407781327
                   }
                 ],
                 "name": "LATE",
                 "width": 254.05714,
                 "height": 155.31429,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 2081037738
                   }
                 ],
                 "name": "EARLY",
                 "width": 237.6,
                 "height": 304.45715,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 1102081447
                   }
                 ],
                 "name": "MID -",
                 "width": 447.6,
                 "height": 296.4,
                 "description": "(proc Arcane Surge before ULT)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 3005970438
                   }
                 ],
                 "name": "LATE",
                 "width": 261.25714,
                 "height": 298.2857
               }
             ]
           },
           "hero_id": 13,
           "version": 2,
           "language": 8,
           "description": "1337",
           "hero_build_id": 212333,
           "origin_build_id": 161813,
           "author_account_id": 1048683446,
           "last_updated_timestamp": 1741287576
         },
         "rollup_category": 2,
         "num_weekly_favorites": 293
       }', 8, 293, 2),
       (12, 26472, 2, 150182154, 0, 0, 0, '2024-09-08 17:20:42.000000', '{
         "hero_build": {
           "name": "Nekromanser lich",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3826390464,
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
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "линия",
                 "width": 768.0,
                 "height": 135.0,
                 "description": "покупать последовательно"
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   }
                 ],
                 "name": "мид",
                 "width": 662.0,
                 "height": 140.0,
                 "description": "покупать последовательно"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   }
                 ],
                 "name": "универсальные",
                 "width": 229.0,
                 "height": 146.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   }
                 ],
                 "name": "лейт",
                 "width": 231.0,
                 "height": 126.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   }
                 ],
                 "name": "монстр режим",
                 "width": 444.0,
                 "height": 152.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "ситуативно",
                 "width": 228.0,
                 "height": 148.0,
                 "description": null
               }
             ]
           },
           "hero_id": 12,
           "version": 2,
           "language": 0,
           "description": "Универсальные слоты закупаем по мере открытия",
           "hero_build_id": 26472,
           "origin_build_id": 0,
           "author_account_id": 150182154,
           "last_updated_timestamp": 1725816042
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (19, 112912, 1, 1253747887, 2, 0, 0, '2024-10-15 09:13:33.000000', '{
         "hero_build": {
           "name": "Movement Player Shiv",
           "details": {
             "ability_order": {
               "currency_changes": [
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
                     "ability_id": 4139877411,
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
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   }
                 ],
                 "name": "Early Gamer",
                 "width": 1030.0,
                 "height": null,
                 "description": "Basix"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "Early game to Mid",
                 "width": 1030.0,
                 "height": null,
                 "description": "Buff and Max Slice and Dice"
               },
               {
                 "mods": [
                   {
                     "ability_id": 630839635,
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
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "End Game",
                 "width": 1030.0,
                 "height": null,
                 "description": "Mystic Reverb on Slice and Dice"
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 0,
           "description": "I hope they don''t nerf the dash tech :(",
           "hero_build_id": 112912,
           "origin_build_id": 0,
           "author_account_id": 1253747887,
           "last_updated_timestamp": 1728983613
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (6, 54973, 1, 284328722, 3, 0, 0, '2024-09-17 13:54:21.000000', '{
         "hero_build": {
           "name": "Unkillable demon build",
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
                   "ability_id": 4072270083,
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
                   "ability_id": 509856396,
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
                   "delta": -2,
                   "ability_id": 715762406,
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
                   "delta": -1,
                   "ability_id": 4072270083,
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
                   "ability_id": 4072270083,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 509856396,
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
                   "delta": -5,
                   "ability_id": 509856396,
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
                   "ability_id": 2824119765,
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
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 1437614329,
                     "annotation": null
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
                     "annotation": "Sell if no flex slot\noptional"
                   }
                 ],
                 "name": "Early",
                 "width": 678.0,
                 "height": 144.0,
                 "description": "last to optional"
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
                     "ability_id": 1644605047,
                     "annotation": null
                   }
                 ],
                 "name": "Resist",
                 "width": 342.0,
                 "height": 148.0,
                 "description": "RB if there is lot of cc"
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": "ASAP"
                   },
                   {
                     "ability_id": 1252627263,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 1030.0,
                 "height": null,
                 "description": "push the first 4 rest is optional"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 1030.0,
                 "height": null,
                 "description": "armor if needed push stamina and leech"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2481177645,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   }
                 ],
                 "name": "Extra",
                 "width": 1030.0,
                 "height": null,
                 "description": "buy these if you feel like or no flex berserker if you need extra dmg in early game"
               }
             ]
           },
           "hero_id": 6,
           "version": 1,
           "language": 0,
           "description": "You can dominate a game with this build",
           "hero_build_id": 54973,
           "origin_build_id": 0,
           "author_account_id": 284328722,
           "last_updated_timestamp": 1726581261
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 3,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (20, 136047, 1, 111630852, 0, 0, 0, '2024-10-29 16:27:42.000000', '{
         "hero_build": {
           "name": "Petter: Thorn Build",
           "details": {
             "ability_order": {},
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 3399065363
                   }
                 ],
                 "name": "First",
                 "width": 1030.0,
                 "description": "Rush"
               },
               {
                 "mods": [
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 2447176615
                   }
                 ],
                 "name": "Second",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 787198704
                   }
                 ],
                 "name": "Last",
                 "width": 1030.0,
                 "description": "Order left => Right"
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
                     "ability_id": 865846625
                   }
                 ],
                 "name": "Defensive",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 20,
           "version": 1,
           "language": 17,
           "description": "Super damage thorns",
           "hero_build_id": 136047,
           "origin_build_id": 0,
           "author_account_id": 111630852,
           "last_updated_timestamp": 1730219262
         },
         "rollup_category": 4
       }', 17, 0, 4),
       (2, 26117, 1, 60361460, 0, 0, 0, '2024-09-03 18:56:47.000000', '{
         "hero_build": {
           "name": "ludoman",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 539192269,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 1
                 },
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
                   "delta": -2,
                   "ability_id": 1065103387,
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
                   "delta": -1,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2061574352,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2061574352,
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
                   "delta": -2,
                   "ability_id": 2061574352,
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
                     "ability_id": 1248737459,
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
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   }
                 ],
                 "name": "Лейнинг",
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
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   }
                 ],
                 "name": "После линии",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   }
                 ],
                 "name": "Мид гейм",
                 "width": 555.0,
                 "height": 107.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "лейт",
                 "width": 451.0,
                 "height": 156.0,
                 "description": null
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
                 "name": "Броня",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 2,
           "version": 1,
           "language": 0,
           "description": "21",
           "hero_build_id": 26117,
           "origin_build_id": 0,
           "author_account_id": 60361460,
           "last_updated_timestamp": 1725389807
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (58, 160947, 2, 104554464, 1, 0, 0, '2024-11-21 03:47:31.000000', '{
         "hero_build": {
           "name": "Mercs Viper Build",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   }
                 ],
                 "name": "Early Gun",
                 "width": 232.5,
                 "height": 300.75,
                 "description": null
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
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   }
                 ],
                 "name": "Early Health",
                 "width": 230.25,
                 "height": 297.75,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   }
                 ],
                 "name": "Early Spirit",
                 "width": 229.5,
                 "height": 298.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Gun",
                 "width": 338.25,
                 "height": 152.25,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Health",
                 "width": 340.5,
                 "height": 159.75,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   }
                 ],
                 "name": "Mid/Late Spirit",
                 "width": 310.5,
                 "height": 149.25,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   }
                 ],
                 "name": "Late Gun",
                 "width": 339.0,
                 "height": 148.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   }
                 ],
                 "name": "Big Fed",
                 "width": 342.0,
                 "height": 106.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 313.5,
                 "height": 77.25,
                 "description": null
               }
             ]
           },
           "hero_id": 58,
           "version": 2,
           "language": 0,
           "description": "slippery boi",
           "hero_build_id": 160947,
           "origin_build_id": 0,
           "author_account_id": 104554464,
           "last_updated_timestamp": 1732160851
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (7, 189997, 5, 291902996, 0, 0, 0, '2025-01-16 00:56:50.000000', '{
         "hero_build": {
           "name": "Aidan never lose (fire rate)",
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
                   "ability_id": 2981692841,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "currency_type": 1
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
                   "ability_id": 4147641675,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2981692841,
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
                   "delta": -5,
                   "ability_id": 2981692841,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1999680326,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4147641675,
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
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 1797283378
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 4139877411
                   }
                 ],
                 "name": "Lane",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 811521119
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3696726732
                   }
                 ],
                 "name": "Mid",
                 "width": 1023.0,
                 "height": 294.0,
                 "description": "imbue 1 qsr, 3 surge. sell extra charge first for slots. Everything after sharpshooter situational"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407781327
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 2356412290
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 2480592370
                   },
                   {
                     "ability_id": 1055679805
                   }
                 ],
                 "name": "Late",
                 "width": 1080.0,
                 "height": 181.0,
                 "description": "Colossus for late game survivability"
               }
             ]
           },
           "hero_id": 7,
           "version": 5,
           "language": 0,
           "description": "100% win rate",
           "hero_build_id": 189997,
           "origin_build_id": 0,
           "author_account_id": 291902996,
           "last_updated_timestamp": 1736989010
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (15, 172185, 2, 899137980, 0, 0, 0, '2024-12-03 21:26:18.000000', '{
         "hero_build": {
           "name": "bebop''s fat piss",
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
                   "delta": -1,
                   "ability_id": 3832675871,
                   "currency_type": 2
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
                 },
                 {
                   "delta": -2,
                   "ability_id": 1928108461,
                   "currency_type": 1
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
                   "delta": -1,
                   "ability_id": 2521902222,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1928108461,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2521902222,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3089858203,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2521902222,
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
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 465043967
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 968099481
                   }
                 ],
                 "name": "can''t talk rn I''m making piss",
                 "width": 774.0,
                 "height": 162.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 1437614329
                   }
                 ],
                 "name": "healthy stream",
                 "width": 244.0,
                 "height": 168.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "on 4 to keep a small bladder"
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "on 4 for a good long pee"
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 1144549437
                   }
                 ],
                 "name": "MORE POWER!!!!!",
                 "width": 666.0,
                 "height": 301.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 2603935618
                   }
                 ],
                 "name": "extra healthy stream",
                 "width": 352.0,
                 "height": 298.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 4075861416
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 677738769
                   },
                   {
                     "ability_id": 3357231760
                   }
                 ],
                 "name": "pressure washer",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2356412290
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 395867183
                   },
                   {
                     "ability_id": 2226497419
                   }
                 ],
                 "name": "baby piss upgrades",
                 "width": 347.0,
                 "height": 299.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 1252627263
                   },
                   {
                     "ability_id": 3190916303
                   }
                 ],
                 "name": "you''re pee shy",
                 "width": 679.0,
                 "height": 295.0,
                 "description": "it''s ok I understand"
               }
             ]
           },
           "hero_id": 15,
           "version": 2,
           "language": 0,
           "description": "stay hydrated to make BIG BIG streams",
           "hero_build_id": 172185,
           "origin_build_id": 0,
           "author_account_id": 899137980,
           "last_updated_timestamp": 1733261178
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (12, 202159, 2, 96963036, 2, 0, 0, '2025-02-06 01:59:32.000000', '{
         "hero_build": {
           "name": "ohioian support kelvin ",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 789.0,
                 "height": 136.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   }
                 ],
                 "name": "get if going slowing",
                 "width": 201.0,
                 "height": 176.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   }
                 ],
                 "name": "pick one",
                 "width": 231.0,
                 "height": 148.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   }
                 ],
                 "name": "pick 1",
                 "width": 240.0,
                 "height": 147.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 1804594021,
                     "annotation": null
                   }
                 ],
                 "name": "get both",
                 "width": 538.0,
                 "height": 149.0,
                 "description": "suppressor makes nade create better trade first ticks faster"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   }
                 ],
                 "name": "mid late",
                 "width": 1030.0,
                 "height": null,
                 "description": "reach and scd on ult "
               },
               {
                 "mods": [
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   }
                 ],
                 "name": "conditional actives",
                 "width": 447.0,
                 "height": 153.0,
                 "description": null
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
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   }
                 ],
                 "name": "Misc",
                 "width": 573.0,
                 "height": 101.25,
                 "description": "armour as needed "
               }
             ]
           },
           "hero_id": 12,
           "version": 2,
           "language": 0,
           "description": " a potential nade/beam build",
           "hero_build_id": 202159,
           "origin_build_id": 200704,
           "author_account_id": 96963036,
           "last_updated_timestamp": 1738807172
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (50, 190361, 1, 1558266220, 1, 0, 0, '2025-01-10 00:26:40.000000', '{
         "hero_build": {
           "name": "Most unhinged super cringe pocket build",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
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
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
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
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   }
                 ],
                 "name": "regular lane :)",
                 "width": 506.0,
                 "height": 423.0,
                 "description": null
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
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   }
                 ],
                 "name": "Tough lane :(",
                 "width": 516.0,
                 "height": 426.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
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
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
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
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "Mid-Late",
                 "width": 1100.0,
                 "height": 300.0,
                 "description": "Left>right, super flexible(picky) mid to late game"
               }
             ]
           },
           "hero_id": 50,
           "version": 1,
           "language": 0,
           "description": "ad",
           "hero_build_id": 190361,
           "origin_build_id": 0,
           "author_account_id": 1558266220,
           "last_updated_timestamp": 1736468800
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (50, 89311, 1, 191305920, 1, 0, 0, '2024-10-02 11:58:40.000000', '{
         "hero_build": {
           "name": "Pocket guide ram0031",
           "details": {
             "ability_order": {
               "currency_changes": []
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
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
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
                     "ability_id": 968099481,
                     "annotation": null
                   }
                 ],
                 "name": "Lane",
                 "width": 1024.0,
                 "height": 155.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   },
                   {
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   }
                 ],
                 "name": "Online",
                 "width": 560.0,
                 "height": 153.0,
                 "description": "Get ASAP surviving lane."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   }
                 ],
                 "name": "Anti-heal",
                 "width": 233.0,
                 "height": 157.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 865958998,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   }
                 ],
                 "name": "Survivability",
                 "width": 1016.0,
                 "height": 153.0,
                 "description": "Either Spirit lifesteal route or veilwalker + barriers."
               },
               {
                 "mods": [
                   {
                     "ability_id": 869090587,
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
                     "ability_id": 2617435668,
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
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   }
                 ],
                 "name": "Luxury",
                 "width": 1148.0,
                 "height": 82.0,
                 "description": "Usually just whatever feels good. "
               }
             ]
           },
           "hero_id": 50,
           "version": 1,
           "language": 0,
           "description": "123",
           "hero_build_id": 89311,
           "origin_build_id": 1038,
           "author_account_id": 191305920,
           "last_updated_timestamp": 1727870320
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (7, 139452, 1, 393562416, 0, 0, 0, '2024-11-01 04:23:21.000000', '{
         "hero_build": {
           "name": "Lurkers - Stein 2.0",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   }
                 ],
                 "name": "Infant",
                 "width": 553,
                 "height": 300,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 499683006,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": ""
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": ""
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": ""
                   }
                 ],
                 "name": "Milestone",
                 "width": 343,
                 "height": 301,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 811521119,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": ""
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": ""
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": ""
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": ""
                   }
                 ],
                 "name": "Adult",
                 "width": 987,
                 "height": 154,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2480592370,
                     "annotation": ""
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": ""
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": ""
                   }
                 ],
                 "name": "Monster Form",
                 "width": 990,
                 "height": 139,
                 "description": ""
               }
             ]
           },
           "hero_id": 7,
           "version": 1,
           "language": 0,
           "description": "Mafia (Bullet)",
           "hero_build_id": 139452,
           "origin_build_id": 27,
           "author_account_id": 393562416,
           "last_updated_timestamp": 1730435001
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (35, 19735, 7, 33191850, 17, 0, 0, '2024-12-27 00:08:51.000000', '{
         "hero_build": {
           "name": "GOOGLYGUY",
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
                   "ability_id": 1020817390,
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
                   "ability_id": 4206531918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1020817390,
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
                   "delta": -2,
                   "ability_id": 3247040238,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3247040238,
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
                   "delta": -1,
                   "ability_id": 3788152387,
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
                   "delta": -2,
                   "ability_id": 3788152387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3788152387,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
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
                     "ability_id": 3399065363,
                     "annotation": null
                   }
                 ],
                 "name": "GOO",
                 "width": 1030.0,
                 "height": null,
                 "description": "L to R - YOU ARE THE BALL MAN. BE THE BALL. DONT DIE. GET 100 ASSISTS."
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   }
                 ],
                 "name": "GOO 2",
                 "width": 1064.4000244140625,
                 "height": 157.1999969482422,
                 "description": "L to R - BUY AS SOON AS U CAN AFFORD. SELL AMMO SCAV & MELEE LIFESTEAL."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   }
                 ],
                 "name": "GOO 3",
                 "width": 1039.2000732421875,
                 "height": 154.8000030517578,
                 "description": "L to R - BUY AS SOON AS YOU CAN . DONT DIE."
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": null
                   }
                 ],
                 "name": "GOO 4 - LATE GAME DONT DIE",
                 "width": 452.4000244140625,
                 "height": 152.40000915527344,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2800629741,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 1804594021,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   }
                 ],
                 "name": "OPTIONAL MOVEMENT & UTILITY",
                 "width": 570.0,
                 "height": 144.0,
                 "description": "ITS A MOVEMENT GAME"
               }
             ]
           },
           "hero_id": 35,
           "version": 7,
           "language": 0,
           "description": "Japanese submarine slammed two torpedoes into her side, Chief. We was comin’ back from the island of Tinian to Leyte. We’d just delivered the bomb. The Hiroshima bomb. Eleven hundred men went into the water. Vessel went down in 12 minutes.\r\nDidn’t see the first gooman for about a half-hour. Green. 13-footer. You know how you know that in the water, Chief? You can tell by lookin’ from the head to the feet. What we didn’t know, was that our bomb mission was so secret, no distress signal had been sent. They didn’t even list us overdue for a week. Very first light, Chief, goomen come cruisin’ by, so we formed ourselves into tight groups. It was sorta like you see in the calendars, you know the infantry squares in the old calendars like the Battle of Waterloo and the idea was the gooman come to the nearest man, that man he starts poundin’ and hollerin’ and sometimes that gooman he go away… but sometimes he wouldn’t go away.\r\nSometimes that gooman looks right at ya. Right into your eyes. And the thing about a gooman is he’s got lifeless eyes. Black eyes. Like a doll’s eyes. When he comes at ya, he doesn’t even seem to be livin’… ’til he fists ya, and those black eyes roll over white and then… ah then you hear that terrible high-pitched screamin’. The ocean turns red, and despite all your poundin’ and your hollerin’ those goomen come in and… they fist you to pieces.\r\nYou know by the end of that first dawn, lost a hundred men. I don’t know how many goomen there were, maybe a thousand. I do know how many men, they averaged six an hour. Thursday mornin’, Chief, I bumped into a friend of mine, Herbie Robinson from Cleveland. Baseball player. Boson’s mate. I thought he was asleep. I reached over to wake him up. He bobbed up, down in the water, he was like a kinda top. Upended. Well, he’d been fisted in half below the waist.\r\nAt noon on the fifth day, a Lockheed Ventura swung in low and he spotted us, a young pilot, lot younger than Mr. Hooper here, anyway he spotted us and a few hours later a big ol’ fat PBY come down and started to pick us up. You know that was the time I was most frightened. Waitin’ for my turn. I’ll never put on a lifejacket again. So, eleven hundred men went into the water. 316 men come out, the goomen took the rest, June the 29th, 1945. Anyway, we delivered the bomb.",
           "hero_build_id": 19735,
           "origin_build_id": 0,
           "author_account_id": 33191850,
           "last_updated_timestamp": 1735258131
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 17,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (13, 162335, 8, 446814137, 0, 0, 0, '2024-11-23 20:24:47.000000', '{
         "hero_build": {
           "name": "OneDink''s The devastator Haze",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 731943444,
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
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 4139877411
                   }
                 ],
                 "name": "500 souls ->",
                 "width": 572.0,
                 "height": 154.0,
                 "description": "Start lane"
               },
               {
                 "mods": [
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 84321454
                   }
                 ],
                 "name": "1250 souls ->",
                 "width": 449.0,
                 "height": 152.0,
                 "description": "Early game."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 334300056
                   }
                 ],
                 "name": "3000 souls+ ->",
                 "width": 573.0,
                 "height": 148.0,
                 "description": "Mid Game.  "
               },
               {
                 "mods": [
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 1371725689
                   },
                   {
                     "ability_id": 865846625
                   }
                 ],
                 "name": "6200 souls +",
                 "width": 446.0,
                 "height": 152.0,
                 "description": "Late game and GG."
               },
               {
                 "mods": [
                   {
                     "ability_id": 3144988365
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3361075077
                   },
                   {
                     "ability_id": 3133167885
                   },
                   {
                     "ability_id": 4003032160
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3140772621
                   }
                 ],
                 "name": "Situational.",
                 "width": 454.0,
                 "height": 304.0,
                 "description": "Anti-stun, anti-heal and etc."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 339443430
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 365620721
                   }
                 ],
                 "name": "Upgrades.",
                 "width": 572.0,
                 "height": 305.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 13,
           "version": 8,
           "language": 0,
           "description": "Have fun.",
           "hero_build_id": 162335,
           "origin_build_id": 101948,
           "author_account_id": 446814137,
           "last_updated_timestamp": 1732393487
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (17, 85315, 2, 102847727, 9, 0, 0, '2024-10-01 16:18:07.000000', '{
         "hero_build": {
           "name": "[Arolix] Hybrid Arrow",
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
                   "ability_id": 3452399392,
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
                   "delta": -1,
                   "ability_id": 512733154,
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
                   "delta": -2,
                   "ability_id": 3452399392,
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
                     "ability_id": 1009965641,
                     "annotation": "Sell next if no flex"
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
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
                     "ability_id": 558396679,
                     "annotation": "Sell first if no flex"
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   }
                 ],
                 "name": "Laning Phase",
                 "width": 769.0,
                 "height": 149.0,
                 "description": "Ideally Left > Right"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Optional Lane - Heal",
                 "width": 230.0,
                 "height": 148.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3970837787,
                     "annotation": "Can be sold if really late game for tier 4 items"
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": "Imbue to Skill 1. Last item to sell in really late games for stronger items"
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": "Can be sold for tier 4 items"
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "Imbue to Skill 1."
                   },
                   {
                     "ability_id": 3331811235,
                     "annotation": null
                   }
                 ],
                 "name": "Early-Game",
                 "width": 772.0,
                 "height": 177.0,
                 "description": "Ideally Left > Right. Get SoP if ahead."
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
                 "name": "Defense Items",
                 "width": 234.0,
                 "height": 178.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2152872419,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game",
                 "width": 445.0,
                 "height": 142.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game",
                 "width": 229.0,
                 "height": 146.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "No Flex Slots",
                 "width": 336.0,
                 "height": 141.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
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
                     "ability_id": 865958998,
                     "annotation": null
                   }
                 ],
                 "name": "Optional",
                 "width": 1030.0,
                 "height": null,
                 "description": "Strong Items for early game item replacements"
               }
             ]
           },
           "hero_id": 17,
           "version": 2,
           "language": 0,
           "description": "Hybrid Weapon + Spirit build. Remember to snipe kills with Owl to build up permenent spirit stacks.",
           "hero_build_id": 85315,
           "origin_build_id": 44013,
           "author_account_id": 102847727,
           "last_updated_timestamp": 1727799487
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 9,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (19, 143348, 6, 34934360, 0, 0, 0, '2024-11-26 00:30:12.000000', '{
         "hero_build": {
           "name": "the d1vio shiv weapon tank build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2460791803,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2460791803,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1458044103,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1537272748,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2460791803,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1835738020,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1458044103,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1835738020,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1835738020,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1537272748,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1537272748,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3862866912
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 3633614685
                   }
                 ],
                 "name": "sustain",
                 "width": 336.0,
                 "height": 297.0,
                 "description": "resto for headshot or close. pick 2 vitality."
               },
               {
                 "mods": [
                   {
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 1998374645
                   }
                 ],
                 "name": "t1",
                 "width": 229.0,
                 "height": 297.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": "imbue on 1."
                   },
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 2603935618
                   }
                 ],
                 "name": "t2",
                 "width": 447.0,
                 "height": 296.0,
                 "description": "can t3 after lifesteal."
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 2095565695
                   }
                 ],
                 "name": "t3",
                 "width": 228.0,
                 "height": 100.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 339443430
                   }
                 ],
                 "name": "t4",
                 "width": 228.0,
                 "height": 110.0,
                 "description": "buy after first flex."
               },
               {
                 "mods": [
                   {
                     "ability_id": 1150006784
                   },
                   {
                     "ability_id": 1414319208
                   },
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 865846625
                   }
                 ],
                 "name": "luxury",
                 "width": 556.0,
                 "height": 71.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 2059712766
                   },
                   {
                     "ability_id": 3361075077
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 1282141666
                   }
                 ],
                 "name": "vitality flexes",
                 "width": 1089.0,
                 "height": 295.253,
                 "description": "pick any 4 of all items below as you need them. can replace in build items as you see fit."
               },
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "imbue on 1."
                   },
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 1976391348
                   },
                   {
                     "ability_id": 3144988365
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 2922054143
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 619484391
                   },
                   {
                     "ability_id": 2617435668
                   }
                 ],
                 "name": "spirit flexes",
                 "width": 1069.0,
                 "height": 295.0963
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 2481177645
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 1113837674
                   },
                   {
                     "ability_id": 1055679805
                   }
                 ],
                 "name": "weapon flexes",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 19,
           "version": 6,
           "language": 0,
           "description": "features ability ordering, imbues on annotations, and items in order of priority per tier of item.",
           "hero_build_id": 143348,
           "origin_build_id": 0,
           "author_account_id": 34934360,
           "last_updated_timestamp": 1732581012
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (31, 149663, 7, 98153389, 0, 0, 0, '2024-11-10 00:26:40.000000', '{
         "hero_build": {
           "name": "moin",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3561817145,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 519124136,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2670099061,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 397010810,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 397010810,
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
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 395867183
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 84321454
                   }
                 ],
                 "name": "LANING/EARLY",
                 "width": 1021.0,
                 "height": 183.0,
                 "description": "QR ON FLOG"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 3633614685
                   }
                 ],
                 "name": "SUSTAIN",
                 "width": 339.0,
                 "height": -7.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 4053935515
                   }
                 ],
                 "name": "CORE",
                 "width": 336.0,
                 "height": 134.25,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 1644605047
                   }
                 ],
                 "name": "MID DEFENSIVES",
                 "width": 336.0,
                 "height": 63.0,
                 "description": "RB IF CC"
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 3696726732
                   },
                   {
                     "ability_id": 787198704
                   }
                 ],
                 "name": "LATE",
                 "width": 568.0,
                 "height": 152.0,
                 "description": "CD ON FLOG"
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
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   }
                 ],
                 "name": "LATE DEFENSIVES",
                 "width": 449.0,
                 "height": 156.0,
                 "description": "AS NEEDED"
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 865958998
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 600033864
                   },
                   {
                     "ability_id": 3357231760
                   }
                 ],
                 "name": "OPTIONS",
                 "width": 1026.0,
                 "height": 162.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 31,
           "version": 7,
           "language": 0,
           "description": "allrounder hybrid slam/gun build",
           "hero_build_id": 149663,
           "origin_build_id": 119830,
           "author_account_id": 98153389,
           "last_updated_timestamp": 1731198400
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (7, 104716, 1, 111236346, 3, 0, 0, '2024-10-10 22:31:12.000000', '{
         "hero_build": {
           "name": "Card Tricks are for Zoomers",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1999680326,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1842576017,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2981692841,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4147641675,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": "Use for extra nuke potential/healing a bit in lane"
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": "Apply to \"Card Trick\""
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 1798666702,
                     "annotation": "Activate before engagements to set up. Take full advantage of the ambush effect during fights"
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "Apply to \"Card Trick\""
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "Apply to \"Telekinesis\""
                   }
                 ],
                 "name": "CORE",
                 "width": 1024.0,
                 "height": 310.0,
                 "description": "Buy mostly in order interjecting HEALTH/SITUATIONAL when necessary"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3696726732,
                     "annotation": "Probably the most useful item in this section. the heal reduction is the important bit. someone on your team should have heal reduction"
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": "Overall good item, buy is they keep getting away. IMO essential for dealing with Viscous"
                   },
                   {
                     "ability_id": 3133167885,
                     "annotation": "Good item for long games and games where your team is lacking lockdown. Buy if your team can''t stay away from Dynamo ult"
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": "If you''re behind early this is great for farming but if you''re ahead you can skip it"
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": "Crazy good sustain if you keep dying in fights "
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": "Really good if you lose early game and have to play from behind. Also good for dealing with an Abrams faster if he keeps ganking you"
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": "Apply to \"Card Trick.\" Good for a more team-fight centric build. Adds a touch more AOE to an otherwise single-target focused hero"
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "Great for games in which your team is lacking lockdown and Pocket or other casters are destroying you\n"
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": "If the rest of your team refuses to buy this against Vindicta, get it"
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": "Very good against Haze, Ivy, Seven, Vindicta and other heroes building fire rate buff"
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": "Very expensive, only get if you are ahead and don''t care about gun items"
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": "Good for a more team-fight centric build allowing you to lift people from a bit safer of a position. Can be replaced by better positioning"
                   }
                 ],
                 "name": "SITUATIONAL",
                 "width": 552.0,
                 "height": 628.0,
                 "description": "Buy what you need when/if you need it"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": "Get early if your facing light-moderate laning harass"
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": "Get early if facing moderate-extreme harass"
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": "Best bang for your buck of the three early game vit items get if facing none-light harass"
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": "This item should be one of your 4 vitality items for most if not all of the game. grab between \"Soul Shredder Bullets\"and \"Shadow Weave\""
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": "Very solid synergy with the build, great for heavy spirit damage games"
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
                     "ability_id": 865958998,
                     "annotation": "One of the best roaming items for a gank heavy build. solid all around and can be picked up in most games"
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": "Get against Pocket, Infernus, Bebop (for bomb) and other heroes putting DOTs on you"
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": "F#@% Haze"
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": "Awesome sustain, a bit pricey, but good for longer games especially"
                   }
                 ],
                 "name": "HEALTH",
                 "width": 465.0,
                 "height": 602.0,
                 "description": "Buy any that are necessary on a game to game basis. Pay attention to the incoming damage screen on death"
               }
             ]
           },
           "hero_id": 7,
           "version": 1,
           "language": 0,
           "description": "Fully annotated \"Card Trick\" focused build guide",
           "hero_build_id": 104716,
           "origin_build_id": 1,
           "author_account_id": 111236346,
           "last_updated_timestamp": 1728599472
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 3,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (27, 132469, 3, 365337506, 0, 0, 0, '2024-10-28 05:12:41.000000', '{
         "hero_build": {
           "name": "B站柚子deadlock大和AD出装",
           "details": {
             "ability_order": {
               "currency_changes": [
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
                   "ability_id": 2566573207,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3255651252,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 2566573207,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3319782965,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3319782965,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2566573207,
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
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 2678489038
                   }
                 ],
                 "name": "类别 1",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 7409189
                   }
                 ],
                 "name": "类别 2",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 2095565695
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 2717651715
                   }
                 ],
                 "name": "类别 3",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 365620721
                   },
                   {
                     "ability_id": 339443430
                   },
                   {
                     "ability_id": 865846625
                   }
                 ],
                 "name": "类别 4",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 1282141666
                   },
                   {
                     "ability_id": 677738769
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2617435668
                   }
                 ],
                 "name": "类别 5",
                 "width": 1030.0
               },
               {
                 "name": "类别 6",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 27,
           "version": 3,
           "language": 6,
           "description": "Bilibili 5501645",
           "hero_build_id": 132469,
           "origin_build_id": 0,
           "author_account_id": 365337506,
           "last_updated_timestamp": 1730092361
         },
         "rollup_category": 3,
         "num_daily_favorites": 1
       }', 6, 0, 3),
       (52, 79909, 4, 308291899, 2, 0, 0, '2024-09-29 02:01:33.000000', '{
         "hero_build": {
           "name": "tilt build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2604653402,
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
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 555.272705078125,
                 "height": 147.27272033691406,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617,
                     "annotation": null
                   },
                   {
                     "ability_id": 4104549924,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 2922054143,
                     "annotation": null
                   }
                 ],
                 "name": "Category 2",
                 "width": 448.3636169433594,
                 "height": 159.27272033691406,
                 "description": null
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
                   }
                 ],
                 "name": "Category 3",
                 "width": 234.5454559326172,
                 "height": 146.1818084716797,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2463960640,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
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
                     "ability_id": 3361075077,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "Category 4",
                 "width": 785.4545288085938,
                 "height": 68.7272720336914,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2480592370,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   }
                 ],
                 "name": "Category 5",
                 "width": 337.0909118652344,
                 "height": 137.4545440673828,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   }
                 ],
                 "name": "Category 6",
                 "width": 672.0,
                 "height": 142.90908813476562,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   }
                 ],
                 "name": "Category 7",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 52,
           "version": 4,
           "language": 0,
           "description": "this is build",
           "hero_build_id": 79909,
           "origin_build_id": 0,
           "author_account_id": 308291899,
           "last_updated_timestamp": 1727575293
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (50, 163676, 5, 983489871, 0, 0, 0, '2024-12-11 02:54:04.000000', '{
         "hero_build": {
           "name": "сын ульты",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 938149308,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3747867012,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2954330093,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2954330093,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2954330093,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2954330093,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3747867012,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1976701714,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3747867012,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 938149308,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 938149308,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 938149308,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1976701714,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3747867012,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3862866912,
                     "annotation": "для разменов, но как бонус 100 барьера"
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": "сильнейший айтем за 500"
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": "у тебя маг резист отрицательный, бро"
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": "паркур паркур молодежное движение"
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": "как сода, но не для хуя"
                   },
                   {
                     "ability_id": 968099481
                   }
                 ],
                 "name": "Лайн",
                 "width": 673.0,
                 "height": 146.0,
                 "description": "Хотим даблу, но соло тоже ок - если не сосать "
               },
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": "для соло линий или тех линий, когда вы не можете подойти к крипам"
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": "хилимся живём"
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": "если плохо, но можно огрызаться"
                   }
                 ],
                 "name": "Всё плохо",
                 "width": 351.0,
                 "height": 143.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567,
                     "annotation": "нужен нам, как воздух"
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": "оторвал еблище с двустволки"
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": "за свою цену даёт овердохуя"
                   },
                   {
                     "ability_id": 865958998
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 1150006784,
                     "annotation": "лип НАХУЙ мертв, а аркейн сёрдж очень неплохая альтернатива. Эффект работает на первую НАЖАТУЮ кнопку"
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": "срём на лицо врагам чаще обычного"
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": "1400 барьера с нихуище"
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": "только если берём колд фронт"
                   }
                 ],
                 "name": "Мидгейм",
                 "width": 987.0,
                 "height": 149.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": "мобильность"
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": "с фортитудом и вейлом нас ОЧЕНЬ трудно убить"
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "на ульту, но если дохуя таргетной хуйни то третий спелл"
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": "на ульту"
                   },
                   {
                     "ability_id": 7409189
                   }
                 ],
                 "name": "Основа",
                 "width": 556.0,
                 "height": 143.0,
                 "description": "Чаще всего игра заканчивается с этим"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1976391348,
                     "annotation": "Если хекс не нужен или у енеми оч много магии"
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": "вампиризм и контроль"
                   }
                 ],
                 "name": "Берём одно",
                 "width": 230.0,
                 "height": 132.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354,
                     "annotation": "лучший айтем для гибрид перса вроде покета"
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": "кдр, вампиризм, барьер, скорострельность и спиритизм. Найс айтем валв"
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": "вместо ульты у нас теперь рак 4-ой степени"
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": "пиздец"
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": "лишняя мобильность "
                   }
                 ],
                 "name": "Гиперлейт",
                 "width": 668.0,
                 "height": 144.0,
                 "description": "Заполняем слоты полностью"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": "не люблю хилбейн, но иногда у енеми слишком дохуя хилла"
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": "бибоп, хейз, абрамс и т.д.. Если берём, то вместо барьера на пули"
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": "бьем крипочков"
                   },
                   {
                     "ability_id": 3190916303,
                     "annotation": "на удивление хороший слот. Советую против оч контактных героев или если вы фанатка мили атак"
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "если есть один бессмертный хуесос"
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": "эскейпы и Ямато"
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": "севен, бибоп, виндикта, талон и т.д."
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": "если таргет - это труднодоступный герой"
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": "абрамс, бибоп, шив, рейз, инфернус и любой контроль, который позволяет нажимать шмотки"
                   }
                 ],
                 "name": "Ситуативно",
                 "width": 985.0,
                 "height": 143.0
               }
             ]
           },
           "hero_id": 50,
           "version": 5,
           "language": 0,
           "description": "билд от лоу птс монстра. Хуйня полная. Советую",
           "hero_build_id": 163676,
           "origin_build_id": 0,
           "author_account_id": 983489871,
           "last_updated_timestamp": 1733885644
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (18, 214642, 4, 282581730, 0, 0, 0, '2025-03-12 13:31:20.000000', '{
         "hero_build": {
           "name": "1233323",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2406758797,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1454278799,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1454278799,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1914797280,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1914797280,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2406758797,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1917840730,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1917840730,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 1047818222
                   }
                 ],
                 "name": "начало",
                 "width": 983.25,
                 "height": 309.0,
                 "description": "ждём"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 2566692615
                   }
                 ],
                 "name": "если больно",
                 "width": 116.25,
                 "height": 301.5
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 1102081447
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 1292979587
                   }
                 ],
                 "name": "мид",
                 "width": 813.75,
                 "height": 303.75
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 3357231760
                   }
                 ],
                 "name": "лейт",
                 "width": 240.0,
                 "height": 416.25
               },
               {
                 "mods": [
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 619484391
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 1371725689
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3270001687
                   }
                 ],
                 "name": "Контрить нубиков",
                 "width": 700.5,
                 "height": 410.25
               }
             ]
           },
           "hero_id": 18,
           "version": 4,
           "language": 8,
           "description": ";)",
           "hero_build_id": 214642,
           "origin_build_id": 0,
           "author_account_id": 282581730,
           "last_updated_timestamp": 1741786280
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (25, 212723, 1, 63410833, 2, 0, 0, '2025-03-07 17:47:37.000000', '{
         "hero_build": {
           "name": "Warden 26.01.25",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
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
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
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
                 "name": "t1",
                 "width": 1031.0,
                 "height": 145.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454,
                     "annotation": "1 - Flask\n"
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
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
                     "ability_id": 2447176615,
                     "annotation": null
                   }
                 ],
                 "name": "t2",
                 "width": 1020.0,
                 "height": 164.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407033488,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   }
                 ],
                 "name": "t3",
                 "width": 1248.0,
                 "height": 123.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "t4",
                 "width": 1190.0,
                 "height": 119.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 25,
           "version": 1,
           "language": 0,
           "description": "dennis du hund",
           "hero_build_id": 212723,
           "origin_build_id": 192850,
           "author_account_id": 63410833,
           "last_updated_timestamp": 1741369657
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 2,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (18, 96310, 1, 95089248, 1, 0, 0, '2024-10-05 23:01:00.000000', '{
         "hero_build": {
           "name": "Tinktink mo and krill",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2406758797,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1917840730,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1914797280,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1454278799,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
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
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 1030.0,
                 "height": null,
                 "description": "skip regen if ahead buy burst after 2 points in scorn"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "Category 2",
                 "width": 1030.0,
                 "height": null,
                 "description": "torment pulse first then soul shred then enchanters "
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
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
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
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "Category 3",
                 "width": 1030.0,
                 "height": null,
                 "description": "get escalating first after armors then stamina then kevlar "
               },
               {
                 "mods": [],
                 "name": "Category 4",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 18,
           "version": 1,
           "language": 0,
           "description": "ROCKY\n",
           "hero_build_id": 96310,
           "origin_build_id": 0,
           "author_account_id": 95089248,
           "last_updated_timestamp": 1728169260
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (19, 133023, 1, 475742230, 0, 0, 0, '2024-10-27 16:40:00.000000', '{
         "hero_build": {
           "name": "泥头车",
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
                   "ability_id": 1458044103,
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
                   "delta": -2,
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
                   "ability_id": 1458044103,
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
                   "ability_id": 1458044103,
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
                   "delta": -2,
                   "ability_id": 2460791803,
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
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": ""
                   }
                 ],
                 "name": "500",
                 "width": 795.15,
                 "height": 162,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": ""
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": ""
                   }
                 ],
                 "name": "类别 2",
                 "width": 240.3,
                 "height": 152.55,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": ""
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": ""
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": ""
                   }
                 ],
                 "name": "类别 3",
                 "width": 1030.05,
                 "height": 132.3,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": ""
                   }
                 ],
                 "name": "类别 4",
                 "width": 448.2,
                 "height": 160.65001,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2533252781,
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
                     "ability_id": 3731635960,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": ""
                   }
                 ],
                 "name": "类别 5",
                 "width": 577.80005,
                 "height": 147.15001,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": ""
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": ""
                   }
                 ],
                 "name": "类别 6",
                 "width": 236.25002,
                 "height": 152.55,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1371725689,
                     "annotation": ""
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": ""
                   }
                 ],
                 "name": "类别 7",
                 "width": 793.80005,
                 "height": 58.050003,
                 "description": ""
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 6,
           "description": "啊",
           "hero_build_id": 133023,
           "origin_build_id": 126815,
           "author_account_id": 475742230,
           "last_updated_timestamp": 1730047200
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 6, 0, null),
       (20, 83566, 2, 47836876, 0, 0, 0, '2024-09-29 22:52:24.000000', '{
         "hero_build": {
           "name": "ALIVY Drop",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 4111222521,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3642273386,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1531378655,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1247583368,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 4111222521,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 4111222521,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 4111222521,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1247583368,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1247583368,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1247583368,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3642273386,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3642273386,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3642273386,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1531378655,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1531378655,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1531378655,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
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
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "500",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "1250",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   }
                 ],
                 "name": "3000",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   }
                 ],
                 "name": "6k",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
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
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   }
                 ],
                 "name": "order",
                 "width": 1062.0,
                 "height": 304.3121337890625,
                 "description": null
               }
             ]
           },
           "hero_id": 20,
           "version": 2,
           "language": 0,
           "description": ".",
           "hero_build_id": 83566,
           "origin_build_id": 0,
           "author_account_id": 47836876,
           "last_updated_timestamp": 1727650344
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (27, 218472, 2, 440398077, 0, 0, 0, '2025-03-22 14:46:35.000000', '{
         "hero_build": {
           "name": "slash999",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 3255651252,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2366960452,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2566573207,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3319782965,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3255651252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3255651252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3255651252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2366960452,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2366960452,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2566573207,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2566573207,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3319782965,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3319782965,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3319782965,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2366960452,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2566573207,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   }
                 ],
                 "name": "I",
                 "width": 338.3999938964844,
                 "height": 293.1428527832031,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   }
                 ],
                 "name": "II",
                 "width": 337.5,
                 "height": 292.1484375,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": null
                   }
                 ],
                 "name": "",
                 "width": 227.8125,
                 "height": 282.65625,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   }
                 ],
                 "name": "III",
                 "width": 448.4571533203125,
                 "height": 175.88571166992188,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "IV",
                 "width": 232.4571533203125,
                 "height": 296.22857666015625,
                 "description": null
               }
             ]
           },
           "hero_id": 27,
           "version": 2,
           "language": 26,
           "description": "owo",
           "hero_build_id": 218472,
           "origin_build_id": 0,
           "author_account_id": 440398077,
           "last_updated_timestamp": 1742654795
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": null,
         "rollup_category": 4,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 26, 0, 4),
       (12, 161059, 3, 159332058, 0, 0, 0, '2024-11-21 07:57:48.000000', '{
         "hero_build": {
           "name": "Mags Kelvin",
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
                   "delta": -5,
                   "ability_id": 18921423,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
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
                   "ability_id": 3826390464,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
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
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "Early Game",
                 "width": 1005.0,
                 "height": 144.75,
                 "description": "High-Velocity necessary to farm in lane, can sell last two late"
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 1932939246
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2064029594
                   }
                 ],
                 "name": "Mid Game",
                 "width": 768.0,
                 "height": 137.25,
                 "description": "Get Rapid Recharge and Improved Burst earlier if ahead. Sell RR for Alc. Fire"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2956256701
                   },
                   {
                     "ability_id": 2566692615
                   }
                 ],
                 "name": "Heals",
                 "width": 229.5,
                 "height": 149.25
               },
               {
                 "mods": [
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 869090587
                   },
                   {
                     "ability_id": 630839635
                   },
                   {
                     "ability_id": 1371725689
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 3612042342
                   }
                 ],
                 "name": "Late Game",
                 "width": 768.0,
                 "height": 140.25,
                 "description": "Everything on nade"
               },
               {
                 "mods": [
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3713423303
                   }
                 ],
                 "name": "Armor",
                 "width": 229.5,
                 "height": 145.5,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2059712766
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 1282141666
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 619484391
                   },
                   {
                     "ability_id": 2820116164
                   }
                 ],
                 "name": "Situational",
                 "width": 768.0,
                 "height": 129.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   }
                 ],
                 "name": "Better Armor",
                 "width": 229.5,
                 "height": 144.0
               }
             ]
           },
           "hero_id": 12,
           "version": 3,
           "language": 0,
           "description": "Spirit Kelvin",
           "hero_build_id": 161059,
           "origin_build_id": 17516,
           "author_account_id": 159332058,
           "last_updated_timestamp": 1732175868
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (52, 100275, 2, 116532642, 1, 0, 0, '2024-10-08 01:41:19.000000', '{
         "hero_build": {
           "name": "Hellfire''s Bad Mirage Hybrid Build",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
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
                     "ability_id": 3399065363,
                     "annotation": null
                   }
                 ],
                 "name": "Lane",
                 "width": 338.0,
                 "height": 279.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
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
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 338.0,
                 "height": 279.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   }
                 ],
                 "name": "Core",
                 "width": 337.0,
                 "height": 279.0,
                 "description": null
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
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   }
                 ],
                 "name": "Mid game options",
                 "width": 338.0,
                 "height": 282.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   }
                 ],
                 "name": "Luxury",
                 "width": 338.0,
                 "height": 282.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   }
                 ],
                 "name": "Late game upgrades",
                 "width": 228.0,
                 "height": 284.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": null
                   }
                 ],
                 "name": "Best utility",
                 "width": 987.0,
                 "height": 159.0,
                 "description": "Efficient counters"
               }
             ]
           },
           "hero_id": 52,
           "version": 2,
           "language": 0,
           "description": "Here you go",
           "hero_build_id": 100275,
           "origin_build_id": 0,
           "author_account_id": 116532642,
           "last_updated_timestamp": 1728351679
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (17, 145999, 1, 465817278, 0, 0, 0, '2024-11-06 16:31:43.000000', '{
         "hero_build": {
           "name": "когот белт",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
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
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 3399065363
                   }
                 ],
                 "name": "ночала",
                 "width": 781.0,
                 "height": 174.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "ситувация",
                 "width": 231.0,
                 "height": 147.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 3970837787
                   }
                 ],
                 "name": "чучут позже",
                 "width": 1028.0,
                 "height": 151.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 1396247347
                   }
                 ],
                 "name": "123",
                 "width": 338.0,
                 "height": 145.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 1055679805
                   },
                   {
                     "ability_id": 3585132399
                   },
                   {
                     "ability_id": 3261353684
                   }
                 ],
                 "name": "лейт декей",
                 "width": 683.0,
                 "height": 135.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 365620721
                   }
                 ],
                 "name": "321",
                 "width": 231.0,
                 "height": 139.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1254091416
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 869090587
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 1798666702
                   }
                 ],
                 "name": "когда как",
                 "width": 789.0,
                 "height": 151.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 17,
           "version": 1,
           "language": 8,
           "description": "оао",
           "hero_build_id": 145999,
           "origin_build_id": 1012,
           "author_account_id": 465817278,
           "last_updated_timestamp": 1730910703
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (12, 213314, 9, 68457871, 126, 0, 0, '2025-03-09 08:44:18.000000', '{
         "hero_build": {
           "name": "Q KELVIN(QUBR1S) TOP 5 KELVIN NA",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   }
                 ],
                 "name": "core 500s somewhat ordered a bit can skip some",
                 "width": 565.7142944335938,
                 "height": 421.71429443359375,
                 "description": "full breakdown on YT soon. buy greens and items with regen(boots, monster rounds etc. if dying in lane)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
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
                     "ability_id": 558396679,
                     "annotation": null
                   }
                 ],
                 "name": "optional 500s",
                 "width": 449.4857177734375,
                 "height": 417.6000061035156,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197,
                     "annotation": "extremely powerful in lane"
                   },
                   {
                     "ability_id": 2956256701,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": "once 8 minutes hit buy for rotates( once you have 2 points in 2 u are very fast with this) GIVES SLOW RESIST NEEDED STAT FOR KELVIN"
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": "OP OVERLOOKED ITEM MAKE YOUR TEAMMATES BUY IT. you heal more if they have this item. it has resist on antiheal which you need very badly"
                   },
                   {
                     "ability_id": 1414319208,
                     "annotation": "really good item on kelvin you are a bit of a damage sponge this is the best bang for your buck gun damage wise"
                   }
                 ],
                 "name": "core 1250s",
                 "width": 565.7142944335938,
                 "height": 423.77142333984375,
                 "description": "ordered(rush rapid recharge and rescue beam)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2081037738,
                     "annotation": "gives spirit resist as well good if your team doesnt have a lot already "
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": "GIVES LIFESTEAL!!!!!!! GOOD ITEM!!!! HIT PEOPLE BEFORE YOU BEAM THEM TO DEATH THEY CANT MOVE"
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": "if vs haze wraith vyper(adc chars) or if enemy team is heavy on gun items"
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": "if you need antiheal"
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": "as a support player you need to learn to use all of your active slots efficiently and frequently. cooldown also effects actives so very good stat on kelvin"
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": "only buy this if you are going carry kelvin and want to power farm. otherwise if you are support kelvin learn to use the other actives"
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": "only if im ahead, scales with spirit. not bad lategame if you need to fill wep slots"
                   }
                 ],
                 "name": "optional 1250s",
                 "width": 451.5428771972656,
                 "height": 420.68572998046875,
                 "description": "ordered somewhat"
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704,
                     "annotation": "i always max nade first buy this asap once 1 is maxed"
                   },
                   {
                     "ability_id": 1804594021,
                     "annotation": "this item scales healing off of your max health. build max health to increase your healing."
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": "one of the best 3ks in the games hands down bar none insane item especially in ult"
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": "put on 1 or 4 almost always 1 personally"
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": "this is mainly to heal more with your nade and ult"
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   }
                 ],
                 "name": "core 3ksQQQ mostly ordered",
                 "width": 563.6571655273438,
                 "height": 408.3428649902344,
                 "description": "rush rapid recharge(alc fire is good if pushing objectives) "
               },
               {
                 "mods": [
                   {
                     "ability_id": 1102081447,
                     "annotation": "buy if they have a lot of weapon damage"
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": "1 or 3 or 4 usually 4"
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "3 or 4 usually 4\n"
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "1 or 3 this is good if you are going carry build if so put on your 3 early or if you are hybrid gun and spirit put on 1"
                   }
                 ],
                 "name": "optional 3ks",
                 "width": 435.0857238769531,
                 "height": 419.6571350097656,
                 "description": "dont be afraid to ult its worth to save you or any teammate"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621,
                     "annotation": "super late game item unless they are full gun team(incredibly rare)"
                   },
                   {
                     "ability_id": 2163598980,
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
                     "ability_id": 2064029594,
                     "annotation": "kelvin doesnt need weapon slots unless ur going gun kelvin so buy this late for more spirit prot"
                   }
                 ],
                 "name": "armors(buy only as needed) i think of pristine like an armor",
                 "width": 278.74285888671875,
                 "height": 438.1109924316406,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 630839635,
                     "annotation": "best 6k imo for kelvin. can use on 3 if 3 build, usually i use on 1 for more healing and dmg. can use on 2 for rotate or just to stay elevated as well"
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": "on 1 for more dmg and slow"
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": "makes ur nade and ult heal for a lot more and obviously more dmg on 3 as well"
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": "alc fire and your 3 both proc this very easily, kelvin is one of the best characters for this item"
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": "insane item to cancel ults or assassinate with teammates, a tad situational"
                   },
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": "every team needs 2 of these lategame-buy if your team doesnt have 2 by 45 minutes or so(you have to hit their face)"
                   }
                 ],
                 "name": "core 6ks mostly ordered",
                 "width": 353.8285827636719,
                 "height": 425.55078125,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419,
                     "annotation": "mainly for cdr and spirit power"
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": "more cdr and can live better with ult"
                   },
                   {
                     "ability_id": 2800629741,
                     "annotation": "just a really good item but you likely need active slots for better items"
                   },
                   {
                     "ability_id": 1798666702,
                     "annotation": "more spirit power, can run up to someone invis and ult and curse them. can work, not great"
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": "good for the extra health and overall an insane item but not the greatest on kelvin"
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": "good if you imbue ur ult with 3ks especially if you are full supp kelvin"
                   }
                 ],
                 "name": "luxx items",
                 "width": 355.8857116699219,
                 "height": 411.4285888671875,
                 "description": "only buy ultra late(nothing left to buy from core items"
               }
             ]
           },
           "hero_id": 12,
           "version": 9,
           "language": 0,
           "description": "Character guide on the way as well. -Q\n\nhttps://www.youtube.com/@Qubr1s\ntwitch.tv/qubr1s",
           "hero_build_id": 213314,
           "origin_build_id": 0,
           "author_account_id": 68457871,
           "last_updated_timestamp": 1741509858
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 126,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (3, 116964, 1, 107335183, 1, 0, 0, '2024-10-17 20:39:15.000000', '{
         "hero_build": {
           "name": "GREEN!!! Drop me AWP!!",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 537527508,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1796564033,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2048438176,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 775377419,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1796564033,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 775377419,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 775377419,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1796564033,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 775377419,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1796564033,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2048438176,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2048438176,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 537527508,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 537527508,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2048438176,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 537527508,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
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
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   }
                 ],
                 "name": "Early Game",
                 "width": 1000.0,
                 "height": 100.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235,
                     "annotation": null
                   },
                   {
                     "ability_id": 2152872419,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
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
                     "ability_id": 2971868509,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game",
                 "width": 1000.0,
                 "height": 100.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game",
                 "width": 1000.0,
                 "height": 100.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   }
                 ],
                 "name": "Category 4",
                 "width": 1030.0,
                 "height": null,
                 "description": "situational"
               }
             ]
           },
           "hero_id": 3,
           "version": 1,
           "language": 0,
           "description": "Piff paff and you are dead",
           "hero_build_id": 116964,
           "origin_build_id": 1,
           "author_account_id": 107335183,
           "last_updated_timestamp": 1729197555
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (52, 126154, 12, 1607035942, 13, 0, 0, '2024-10-29 22:03:07.000000', '{
         "hero_build": {
           "name": "Ganking support",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2221949202,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3733594387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2604653402,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1336069669,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   }
                 ],
                 "name": "Lane & Early Game",
                 "width": 660.9375,
                 "height": 154.6875,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   }
                 ],
                 "name": "If struggling",
                 "width": 230.625,
                 "height": 149.625,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 619484391,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 79.3125,
                 "height": 150.1875,
                 "description": null
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
                     "ability_id": 3403085434,
                     "annotation": null
                   },
                   {
                     "ability_id": 393974127,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
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
                     "ability_id": 2081037738,
                     "annotation": null
                   }
                 ],
                 "name": "Core midgame",
                 "width": 997.3125,
                 "height": 182.8125,
                 "description": "Can buy Mystic Vuln before S-Shredder if lacking flex slots. Upgrade one or both armors later as needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 2480592370,
                     "annotation": null
                   }
                 ],
                 "name": "Lategame",
                 "width": 552.9375,
                 "height": 153.0,
                 "description": "Sell Ammo Scav for space"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": null
                   }
                 ],
                 "name": "Specific Counters",
                 "width": 336.375,
                 "height": 154.125,
                 "description": "Skip or sell Locket if needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   }
                 ],
                 "name": "Panic Button",
                 "width": 110.25,
                 "height": 143.4375,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 3133167885,
                     "annotation": null
                   },
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   }
                 ],
                 "name": "Finish off the game",
                 "width": 555.1875,
                 "height": 151.3125,
                 "description": "Sell Locket for a slot if the game is long enough to get here"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   }
                 ],
                 "name": "Anti-heal",
                 "width": 230.0625,
                 "height": 33.1875,
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
                 "name": "Imp. Armor",
                 "width": 228.9375,
                 "height": 97.3125,
                 "description": null
               }
             ]
           },
           "hero_id": 52,
           "version": 12,
           "language": 0,
           "description": "Start with Tornado first if laning against something you need i-frames or escape against, like Bebop.",
           "hero_build_id": 126154,
           "origin_build_id": 110523,
           "author_account_id": 1607035942,
           "last_updated_timestamp": 1730239387
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 13,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (50, 137929, 8, 327564944, 0, 0, 0, '2024-11-07 20:39:56.000000', '{
         "hero_build": {
           "name": "put it in my back pocket",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 938149308,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3747867012,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2954330093,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 938149308,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1976701714,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3747867012,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2954330093,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 938149308,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1976701714,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3747867012,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2954330093,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 938149308,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2954330093,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3747867012,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1976701714,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": "ey"
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 558396679
                   }
                 ],
                 "name": "Laning Phase",
                 "width": 896.25,
                 "height": 178.5
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "Regen",
                 "width": 122.25,
                 "height": 180.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 1976391348
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 600033864
                   },
                   {
                     "ability_id": 395867183
                   },
                   {
                     "ability_id": 619484391
                   }
                 ],
                 "name": "Core",
                 "width": 563.25,
                 "height": 300.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 4003032160
                   },
                   {
                     "ability_id": 2617435668
                   }
                 ],
                 "name": "Late Game",
                 "width": 455.25,
                 "height": 299.25
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 1193964439
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 3261353684
                   }
                 ],
                 "name": "Upgrades",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3147316197
                   },
                   {
                     "ability_id": 3361075077
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 1378931225
                   }
                 ],
                 "name": "Situational",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 50,
           "version": 8,
           "language": 0,
           "description": "put it in my pocket put it in my pocket in my back pocket put it in my pocket in my pocket in my back pocket woah woah woah",
           "hero_build_id": 137929,
           "origin_build_id": 137826,
           "author_account_id": 327564944,
           "last_updated_timestamp": 1731011996
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (18, 157842, 2, 144667407, 0, 0, 0, '2024-11-18 11:07:30.000000', '{
         "hero_build": {
           "name": "TurboSex Corporation Mo and Krill",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1454278799,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1454278799,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2406758797,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2406758797,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2406758797,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1454278799,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1914797280,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1914797280,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1917840730,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1917840730,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1914797280,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1917840730,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 754480263
                   }
                 ],
                 "name": "early very good",
                 "width": 344.0,
                 "height": 159.0,
                 "description": "Keep these"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 2829638276
                   }
                 ],
                 "name": "Cheap Shit",
                 "width": 339.0,
                 "height": 163.0,
                 "description": "Disposable, Close Quarters Last to dispose"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 380806748
                   }
                 ],
                 "name": "After buying cheap shit",
                 "width": 235.0,
                 "height": 148.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 393974127
                   }
                 ],
                 "name": "Useful Shit",
                 "width": 343.0,
                 "height": 151.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 2447176615
                   }
                 ],
                 "name": "Also Useful Shit",
                 "width": 446.0,
                 "height": 9.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 1193964439
                   }
                 ],
                 "name": "BURROW SPAM",
                 "width": 776.0,
                 "height": 150.0,
                 "description": "ALL IMBUDES ON BURROW"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 3612042342
                   }
                 ],
                 "name": "Turbosex blender",
                 "width": 269.0,
                 "height": 95.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   }
                 ],
                 "name": "Being anihilated resistance",
                 "width": 229.0,
                 "height": 150.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 1254091416
                   }
                 ],
                 "name": "Bonus Spirit",
                 "width": 425.0,
                 "height": 102.0,
                 "description": "Knockdown to fuck vindicta and talon"
               }
             ]
           },
           "hero_id": 18,
           "version": 2,
           "language": 0,
           "description": "Cheap ass build so good enough for me",
           "hero_build_id": 157842,
           "origin_build_id": 0,
           "author_account_id": 144667407,
           "last_updated_timestamp": 1731928050
         },
         "rollup_category": 4
       }', 0, 0, 4),
       (27, 135852, 1, 1557303666, 0, 0, 0, '2024-10-29 13:46:19.000000', '{
         "hero_build": {
           "name": "Ayrien''s Yamato Build",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": ""
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": ""
                   }
                 ],
                 "name": "Early Game",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 395867183,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": ""
                   }
                 ],
                 "name": "Mid Game",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 869090587,
                     "annotation": ""
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": ""
                   },
                   {
                     "ability_id": 7409189,
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
                     "ability_id": 3585132399,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": ""
                   }
                 ],
                 "name": "Late Game",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1644605047,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": ""
                   }
                 ],
                 "name": "Situational Items",
                 "width": 1030,
                 "height": 0,
                 "description": ""
               }
             ]
           },
           "hero_id": 27,
           "version": 1,
           "language": 0,
           "description": "Spirit Build",
           "hero_build_id": 135852,
           "origin_build_id": 111572,
           "author_account_id": 1557303666,
           "last_updated_timestamp": 1730209579
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (8, 162045, 86, 369792328, 0, 0, 0, '2024-11-22 07:51:36.000000', '{
         "hero_build": {
           "name": "Supernubb-turrets",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1725685134,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2142734020,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1725685134,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3133377790,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3133377790,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3503044146,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3503044146,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2142734020,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3133377790,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3133377790,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2142734020,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2142734020,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1725685134,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3503044146,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1725685134,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3503044146,
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
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 3776945997
                   }
                 ],
                 "name": "Lane",
                 "width": 789.0,
                 "height": 146.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "Lane safe",
                 "width": 229.0,
                 "height": 174.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 2108215830
                   },
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 393974127
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 787198704
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 1102081447
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 2566692615
                   },
                   {
                     "ability_id": 3261353684
                   }
                 ],
                 "name": "Core",
                 "width": 1026.0,
                 "height": 296.0,
                 "description": "Looking for May be items, if have good game"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 3005970438
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 3585132399
                   }
                 ],
                 "name": "May be",
                 "width": 1044.0,
                 "height": 272.0
               }
             ]
           },
           "hero_id": 8,
           "version": 86,
           "language": 8,
           "description": "Only for pro.",
           "hero_build_id": 162045,
           "origin_build_id": 61484,
           "author_account_id": 369792328,
           "last_updated_timestamp": 1732261896
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (61, 154378, 21, 1252592069, 507, 0, 0, '2024-12-05 17:43:10.000000', '{
         "hero_build": {
           "name": "Rey''s 1k Damage Gun Trapper",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2675680636,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3360792911,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3360792911,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3322902852,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 3360792911,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2876116869,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2675680636,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2675680636,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2876116869,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2675680636,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3360792911,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3322902852,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2876116869,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2876116869,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3322902852,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3322902852,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1548066885
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": "Everyone always forgets that this gives +6% fire rate"
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 499683006
                   }
                 ],
                 "name": "Lane",
                 "width": 801.9,
                 "height": 139.725,
                 "description": "Use your 1 and 2 to zone the enemy and your gun does crazy burst damage at point blank"
               },
               {
                 "mods": [
                   {
                     "ability_id": 26002154
                   }
                 ],
                 "name": "Optional",
                 "width": 125.25,
                 "height": 138.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1414319208
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 339443430
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 3403085434
                   }
                 ],
                 "name": "Early Game",
                 "width": 664.875,
                 "height": 147.82501,
                 "description": "QSR on Silktrap. After 1 is maxed always get any t3 camps"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3977876567
                   },
                   {
                     "ability_id": 380806748
                   }
                 ],
                 "name": "Optional",
                 "width": 230.85,
                 "height": 139.725
               },
               {
                 "mods": [
                   {
                     "ability_id": 1371725689
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2095565695
                   }
                 ],
                 "name": "Mid Game",
                 "width": 553.5,
                 "height": 143.77501,
                 "description": "Use Warp Stone and PS to stay intop of the enemy"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2163598980
                   }
                 ],
                 "name": "If they fight back",
                 "width": 445.5,
                 "height": 145.125
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 4053935515
                   },
                   {
                     "ability_id": 3270001687
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 395944548
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 1102081447
                   },
                   {
                     "ability_id": 2356412290
                   }
                 ],
                 "name": "Late Game",
                 "width": 877.5,
                 "height": 143.77501,
                 "description": "Always stay in point blank range of the enemy for max dmg"
               }
             ]
           },
           "hero_id": 61,
           "version": 21,
           "language": 0,
           "description": "Rush Frenzy to literally double your ammo (Frenzy ammo scales with +%ammo)\nThis build literally deals over 1000 damage per shot at point blank and you can reach 4 shots per second in late game (which is 4000+ dps lmao)",
           "hero_build_id": 154378,
           "origin_build_id": 0,
           "author_account_id": 1252592069,
           "last_updated_timestamp": 1733420590
         },
         "num_favorites": 507,
         "rollup_category": 1
       }', 0, 0, 1),
       (1, 160236, 1, 1824912989, 0, 0, 0, '2024-11-20 05:16:16.000000', '{
         "hero_build": {
           "name": "jl20221029 桃子",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1593133799,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 491391007,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3516947824,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1593133799,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1593133799,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1142270357,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3516947824,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 491391007,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 491391007,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1142270357,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1142270357,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3516947824,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1009965641
                   }
                 ],
                 "name": "",
                 "width": 237.59999,
                 "height": 141.29999
               },
               {
                 "mods": [
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "",
                 "width": 257.25,
                 "height": 144.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   }
                 ],
                 "name": "",
                 "width": 364.49997,
                 "height": 139.5
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 1144549437
                   }
                 ],
                 "name": "",
                 "width": 235.79999,
                 "height": 136.79999
               },
               {
                 "mods": [
                   {
                     "ability_id": 876563814
                   },
                   {
                     "ability_id": 3361075077
                   }
                 ],
                 "name": "",
                 "width": 255.75,
                 "height": 59.25
               },
               {
                 "mods": [
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 2081037738
                   },
                   {
                     "ability_id": 2951612397
                   }
                 ],
                 "name": "",
                 "width": 366.3,
                 "height": 150.29999
               },
               {
                 "mods": [
                   {
                     "ability_id": 1925087134
                   }
                 ],
                 "name": "选择",
                 "width": 64.799995,
                 "height": 92.7
               },
               {
                 "mods": [
                   {
                     "ability_id": 3696726732
                   }
                 ],
                 "name": "毒弹",
                 "width": 239.4,
                 "height": 137.7
               },
               {
                 "mods": [
                   {
                     "ability_id": 1644605047
                   }
                 ],
                 "name": "",
                 "width": 256.5,
                 "height": 149.4
               },
               {
                 "mods": [
                   {
                     "ability_id": 2717651715
                   }
                 ],
                 "name": "",
                 "width": 362.0,
                 "height": 144.0
               },
               {
                 "name": "",
                 "width": -920.0,
                 "height": 138.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 2480592370
                   }
                 ],
                 "name": "元灵优先",
                 "width": 240.29999,
                 "height": 136.79999
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2037039379
                   }
                 ],
                 "name": "",
                 "width": 252.9,
                 "height": 150.29999
               },
               {
                 "mods": [
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3403085434
                   }
                 ],
                 "name": "生存",
                 "width": 365.0,
                 "height": 133.0
               }
             ]
           },
           "hero_id": 1,
           "version": 1,
           "language": 6,
           "description": "20241120",
           "hero_build_id": 160236,
           "origin_build_id": 107883,
           "author_account_id": 1824912989,
           "last_updated_timestamp": 1732079776
         },
         "rollup_category": 4
       }', 6, 0, 4),
       (12, 30220, 1, 134401825, 0, 0, 0, '2024-09-05 06:01:07.000000', '{
         "hero_build": {
           "name": "support",
           "details": {
             "ability_order": {
               "currency_changes": []
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 465043967,
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
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   }
                 ],
                 "name": "Category 1",
                 "width": 997.5000610351562,
                 "height": 303.0000305175781,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   }
                 ],
                 "name": "Category 2",
                 "width": 572.25,
                 "height": 307.5000305175781,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 1976391348,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 2956256701,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": null
                   }
                 ],
                 "name": "Category 3",
                 "width": 420.74993896484375,
                 "height": 311.2500305175781,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1804594021,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 787198704,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2481177645,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
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
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 1252627263,
                     "annotation": null
                   }
                 ],
                 "name": "Category 4",
                 "width": 1009.5000610351562,
                 "height": 310.9334411621094,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "Category 5",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 12,
           "version": 1,
           "language": 0,
           "description": "test",
           "hero_build_id": 30220,
           "origin_build_id": 0,
           "author_account_id": 134401825,
           "last_updated_timestamp": 1725516067
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (7, 190437, 5, 992826803, 0, 0, 0, '2025-02-09 00:37:34.000000', '{
         "hero_build": {
           "name": "godnove Wraith ( gun )",
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
                   "ability_id": 2981692841,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1999680326,
                   "currency_type": 1
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
                   "ability_id": 2981692841,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2981692841,
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
                   "ability_id": 1999680326,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 1009965641
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 1797283378
                   },
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 2829638276
                   }
                 ],
                 "name": "lane",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 811521119
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 1282141666
                   },
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 2971868509
                   },
                   {
                     "ability_id": 1292979587
                   }
                 ],
                 "name": "mid",
                 "width": 1030.0,
                 "description": "(Quicksilve Reload skil 1) (Surge of Power skil 3)"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 1925087134
                   },
                   {
                     "ability_id": 1102081447
                   },
                   {
                     "ability_id": 2407781327
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   }
                 ],
                 "name": "late",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 2533252781
                   }
                 ],
                 "name": "situational",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 7,
           "version": 5,
           "language": 22,
           "description": "xD",
           "hero_build_id": 190437,
           "origin_build_id": 0,
           "author_account_id": 992826803,
           "last_updated_timestamp": 1739061454
         },
         "rollup_category": 2,
         "num_weekly_favorites": 5
       }', 22, 5, 2),
       (13, 91825, 3, 200589055, 0, 0, 0, '2024-10-21 15:34:51.000000', '{
         "hero_build": {
           "name": "1337 Haze Haze Baby",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "annotation": "",
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2948410412,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 731943444,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1080948381,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1080948381,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 731943444,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2414191464,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2414191464,
                   "annotation": "",
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2948410412,
                   "annotation": "",
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1548066885,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1248737459,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": ""
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": ""
                   }
                 ],
                 "name": "LANE",
                 "width": 788,
                 "height": 145,
                 "description": "In Order. Sell AS, HB, EH & MR later"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": ""
                   }
                 ],
                 "name": "LANE Healing",
                 "width": 234,
                 "height": 161,
                 "description": "If Needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": ""
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1644605047,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": ""
                   }
                 ],
                 "name": "GREEN Stuff",
                 "width": 662,
                 "height": 139,
                 "description": "If it hurts"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2447176615,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": ""
                   }
                 ],
                 "name": "More Green",
                 "width": 362,
                 "height": 141,
                 "description": "ES = 100%, other is optional"
               },
               {
                 "mods": [
                   {
                     "ability_id": 4104549924,
                     "annotation": ""
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2480592370,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2739107182,
                     "annotation": ""
                   },
                   {
                     "ability_id": 365620721,
                     "annotation": ""
                   }
                 ],
                 "name": "MID 1",
                 "width": 718,
                 "height": 147,
                 "description": "In order. Take Ricochet than go farm JG & Lanes. Swap SS when too fed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617,
                     "annotation": ""
                   },
                   {
                     "ability_id": 84321454,
                     "annotation": ""
                   }
                 ],
                 "name": "Reload Items",
                 "width": 272,
                 "height": 143,
                 "description": "If Needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": ""
                   }
                 ],
                 "name": "ULT BUFFS",
                 "width": 556,
                 "height": 139,
                 "description": "Buy after Mid 1. All on 4th"
               },
               {
                 "mods": [
                   {
                     "ability_id": 865846625,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1396247347,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2356412290,
                     "annotation": ""
                   }
                 ],
                 "name": "LATE",
                 "width": 472,
                 "height": 178,
                 "description": "In any order"
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430,
                     "annotation": ""
                   },
                   {
                     "ability_id": 1055679805,
                     "annotation": ""
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": ""
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": ""
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": ""
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": ""
                   }
                 ],
                 "name": "LATE Extras",
                 "width": 896,
                 "height": 113,
                 "description": "If too fed | needed"
               }
             ]
           },
           "hero_id": 13,
           "version": 3,
           "language": 0,
           "description": "ezmode",
           "hero_build_id": 91825,
           "origin_build_id": 0,
           "author_account_id": 200589055,
           "last_updated_timestamp": 1729524891
         },
         "preference": null,
         "num_ignores": 0,
         "num_reports": 0,
         "num_favorites": 0
       }', 0, 0, null),
       (13, 207922, 8, 278919272, 0, 0, 0, '2025-02-28 00:43:18.000000', '{
         "hero_build": {
           "name": "Parzelion''s ACTUAL GOOD GUN BUILD",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "currency_type": 2
                 },
                 {
                   "delta": -5,
                   "ability_id": 1080948381,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 731943444,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2414191464,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2948410412,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 668299740
                   },
                   {
                     "ability_id": 2010028405
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 558396679
                   }
                 ],
                 "name": "Early Game",
                 "width": 662.0,
                 "height": 140.0,
                 "description": "Twitch.tv/Parzelion L -> R For Best Results"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648
                   },
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 3633614685
                   }
                 ],
                 "name": "Early Health Options",
                 "width": 360.0,
                 "height": 114.0,
                 "description": "ER if needed"
               },
               {
                 "mods": [
                   {
                     "ability_id": 381961617
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 2971868509
                   }
                 ],
                 "name": "Mid-Game",
                 "width": 556.0,
                 "height": 307.0,
                 "description": "QSR on 1.  Use Dagger to reset ammo in fights  Sell ES for BRS. If fed rush crippling over BRS"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2463960640
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 1644605047
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 1378931225
                   },
                   {
                     "ability_id": 1047818222
                   },
                   {
                     "ability_id": 1235347618
                   }
                 ],
                 "name": "Rare Purchases for Defence/Offence",
                 "width": 463.0,
                 "height": 303.0,
                 "description": "DR vs Infernus"
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
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 1113837674
                   },
                   {
                     "ability_id": 2480592370
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 2617435668
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3144988365
                   }
                 ],
                 "name": "Late Game",
                 "width": 576.0,
                 "height": 297.3216,
                 "description": " Can rush Siphon instead of crippling if big enough lead"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 2407781327
                   },
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 1055679805
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 334300056
                   }
                 ],
                 "name": "Raid Boss",
                 "width": 446.0,
                 "height": 296.0,
                 "description": " Colossus OP Tech"
               }
             ]
           },
           "hero_id": 13,
           "version": 8,
           "language": 0,
           "description": "Test Build, use at your own risk. Refer to my ult build for better results\nCombat barrier feels like a waste of 1250\n\nAim, Position, Kill",
           "hero_build_id": 207922,
           "origin_build_id": 199662,
           "author_account_id": 278919272,
           "last_updated_timestamp": 1740703398
         },
         "rollup_category": 3,
         "num_daily_favorites": 43
       }', 0, 0, 3),
       (2, 133966, 2, 375654843, 3, 0, 0, '2024-10-28 05:59:54.000000', '{
         "hero_build": {
           "name": "Ball max to 3 max",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1065103387,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 539192269,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2061574352,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1065103387,
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
                   "delta": -1,
                   "ability_id": 1074714947,
                   "annotation": null,
                   "currency_type": 1
                 },
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
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 1548066885,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   }
                 ],
                 "name": "Lane",
                 "width": 1025.0,
                 "height": 171.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 876563814,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 864.0,
                 "height": 154.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "Active",
                 "width": 153.0,
                 "height": 152.0,
                 "description": "Sell MR"
               },
               {
                 "mods": [
                   {
                     "ability_id": 787198704,
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
                     "ability_id": 2356412290,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 557.0,
                 "height": 149.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "Flex Slots",
                 "width": 464.0,
                 "height": 157.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   }
                 ],
                 "name": "End",
                 "width": 558.0,
                 "height": 141.0,
                 "description": "Sell ER - SL"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   }
                 ],
                 "name": "Flex Slots upgrade",
                 "width": 466.0,
                 "height": 150.0,
                 "description": null
               }
             ]
           },
           "hero_id": 2,
           "version": 2,
           "language": 0,
           "description": "Easy to follow",
           "hero_build_id": 133966,
           "origin_build_id": 0,
           "author_account_id": 375654843,
           "last_updated_timestamp": 1730095194
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 3,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (25, 182633, 1, 353165987, 0, 0, 0, '2024-12-22 04:02:19.000000', '{
         "hero_build": {
           "name": "SANZHAR",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
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
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 1342610602
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 4139877411
                   },
                   {
                     "ability_id": 1998374645
                   }
                 ],
                 "name": "500",
                 "width": 1097.0,
                 "height": 130.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2951612397
                   },
                   {
                     "ability_id": 2603935618
                   },
                   {
                     "ability_id": 393974127
                   }
                 ],
                 "name": "1250",
                 "width": 799.0,
                 "height": 164.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 223594321
                   }
                 ],
                 "name": "армор 1250",
                 "width": 228.0,
                 "height": 158.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2717651715
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 2356412290
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 2095565695
                   },
                   {
                     "ability_id": 2064029594
                   }
                 ],
                 "name": "3000",
                 "width": 800.0,
                 "height": 299.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 2163598980
                   }
                 ],
                 "name": "армор 3к",
                 "width": 228.0,
                 "height": 145.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 365620721
                   }
                 ],
                 "name": "Категория 7",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 25,
           "version": 1,
           "language": 8,
           "description": "sanzhar",
           "hero_build_id": 182633,
           "origin_build_id": 45,
           "author_account_id": 353165987,
           "last_updated_timestamp": 1734840139
         },
         "rollup_category": 4
       }', 8, 0, 4),
       (25, 168734, 4, 448599766, 0, 0, 0, '2025-01-27 15:11:51.000000', '{
         "hero_build": {
           "name": "愚昼ccc",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2656490109,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2702908623,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2751689917,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1656913918,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1248737459
                   },
                   {
                     "ability_id": 1548066885
                   },
                   {
                     "ability_id": 3077079169
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 754480263
                   },
                   {
                     "ability_id": 3399065363
                   },
                   {
                     "ability_id": 3633614685
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "类别 1",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1414319208
                   },
                   {
                     "ability_id": 499683006
                   },
                   {
                     "ability_id": 3403085434
                   },
                   {
                     "ability_id": 84321454
                   },
                   {
                     "ability_id": 1813726886
                   },
                   {
                     "ability_id": 2447176615
                   },
                   {
                     "ability_id": 2951612397
                   }
                 ],
                 "name": "类别 2",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 2407033488
                   },
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 223594321
                   },
                   {
                     "ability_id": 3713423303
                   },
                   {
                     "ability_id": 1047818222
                   }
                 ],
                 "name": "类别 3",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430
                   },
                   {
                     "ability_id": 3140772621
                   },
                   {
                     "ability_id": 3731635960
                   },
                   {
                     "ability_id": 2163598980
                   },
                   {
                     "ability_id": 3357231760
                   },
                   {
                     "ability_id": 3884003354
                   },
                   {
                     "ability_id": 1396247347
                   },
                   {
                     "ability_id": 2820116164
                   },
                   {
                     "ability_id": 2717651715
                   }
                 ],
                 "name": "类别 4",
                 "width": 1030.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1113837674
                   },
                   {
                     "ability_id": 865846625
                   },
                   {
                     "ability_id": 2037039379
                   },
                   {
                     "ability_id": 380806748
                   },
                   {
                     "ability_id": 2533252781
                   },
                   {
                     "ability_id": 3261353684
                   },
                   {
                     "ability_id": 1055679805
                   },
                   {
                     "ability_id": 2226497419
                   }
                 ],
                 "name": "类别 5",
                 "width": 1030.0
               }
             ]
           },
           "hero_id": 25,
           "version": 4,
           "language": 6,
           "description": "1",
           "hero_build_id": 168734,
           "origin_build_id": 0,
           "author_account_id": 448599766,
           "last_updated_timestamp": 1737990711
         },
         "rollup_category": 4
       }', 6, 0, 4),
       (10, 123840, 1, 188438140, 0, 0, 0, '2024-10-22 04:29:48.000000', '{
         "hero_build": {
           "name": "BcJ",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3077079169,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 450.0,
                 "height": 304.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 2059712766,
                     "annotation": null
                   },
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 2956256701,
                     "annotation": null
                   },
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   }
                 ],
                 "name": "Early Situational",
                 "width": 523.0,
                 "height": 303.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   }
                 ],
                 "name": "Mid",
                 "width": 456.0,
                 "height": 288.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
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
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1932939246,
                     "annotation": null
                   },
                   {
                     "ability_id": 1254091416,
                     "annotation": null
                   },
                   {
                     "ability_id": 334300056,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Situational",
                 "width": 566.0,
                 "height": 293.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 345.0,
                 "height": 175.0,
                 "description": null
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
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1804594021,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "Late Situational",
                 "width": 672.0,
                 "height": 143.0,
                 "description": null
               }
             ]
           },
           "hero_id": 10,
           "version": 1,
           "language": 0,
           "description": "z",
           "hero_build_id": 123840,
           "origin_build_id": 110952,
           "author_account_id": 188438140,
           "last_updated_timestamp": 1729571388
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (12, 20814, 1, 90355324, 4, 0, 0, '2024-09-01 05:01:19.000000', '{
         "hero_build": {
           "name": "McStink (Run fast frost gun build)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2351041382,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 18921423,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1963397252,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3826390464,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 1797283378,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   }
                 ],
                 "name": "Early",
                 "width": 577.0,
                 "height": 136.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3147316197,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   }
                 ],
                 "name": "Green Beans",
                 "width": 445.0,
                 "height": 133.0,
                 "description": "Sell Enduring Spirit for Spirit Armor"
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 2447176615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   }
                 ],
                 "name": "Core",
                 "width": 577.0,
                 "height": 74.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   }
                 ],
                 "name": "Purp Flex",
                 "width": 445.0,
                 "height": 40.0,
                 "description": "All Flex Purp"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3005970438,
                     "annotation": null
                   },
                   {
                     "ability_id": 1102081447,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   }
                 ],
                 "name": "Late",
                 "width": 578.0,
                 "height": 83.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2678489038,
                     "annotation": null
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 1144549437,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   }
                 ],
                 "name": "Orange",
                 "width": 446.0,
                 "height": 81.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": null
                   },
                   {
                     "ability_id": 4003032160,
                     "annotation": null
                   }
                 ],
                 "name": "Super Late",
                 "width": 579.0,
                 "height": 107.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2603935618,
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
                     "ability_id": 1047818222,
                     "annotation": null
                   }
                 ],
                 "name": "Situational",
                 "width": 445.0,
                 "height": 145.0,
                 "description": null
               }
             ]
           },
           "hero_id": 12,
           "version": 1,
           "language": 0,
           "description": ":D",
           "hero_build_id": 20814,
           "origin_build_id": 0,
           "author_account_id": 90355324,
           "last_updated_timestamp": 1725166879
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 4,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (31, 4148, 2, 105454199, 0, 0, 0, '2024-08-13 21:36:08.000000', '{
         "hero_build": {
           "name": "lash xd",
           "details": {
             "ability_order": null,
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 558396679,
                     "annotation": null
                   },
                   {
                     "ability_id": 3776945997,
                     "annotation": null
                   },
                   {
                     "ability_id": 968099481,
                     "annotation": null
                   },
                   {
                     "ability_id": 1998374645,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 2010028405,
                     "annotation": null
                   },
                   {
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   }
                 ],
                 "name": "Early Game Options",
                 "width": 1000.0,
                 "height": 100.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1235347618,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3970837787,
                     "annotation": null
                   },
                   {
                     "ability_id": 2603935618,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2566692615,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game Defense Options",
                 "width": 1000.0,
                 "height": 100.0,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   },
                   {
                     "ability_id": 2081037738,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   }
                 ],
                 "name": "Mid Game Spirit Options",
                 "width": 1030.0,
                 "height": null,
                 "description": null
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
                     "ability_id": 334300056,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 600033864,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game Tank Options",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 1193964439,
                     "annotation": null
                   },
                   {
                     "ability_id": 7409189,
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
                     "ability_id": 1292979587,
                     "annotation": null
                   },
                   {
                     "ability_id": 395944548,
                     "annotation": null
                   },
                   {
                     "ability_id": 619484391,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   }
                 ],
                 "name": "Late Game Spirit Options",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3612042342,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 869090587,
                     "annotation": null
                   },
                   {
                     "ability_id": 2617435668,
                     "annotation": null
                   },
                   {
                     "ability_id": 677738769,
                     "annotation": null
                   },
                   {
                     "ability_id": 3696726732,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 811521119,
                     "annotation": null
                   },
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   }
                 ],
                 "name": "RICH",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "SUPER RICH",
                 "width": 1030.0,
                 "height": null,
                 "description": null
               }
             ]
           },
           "hero_id": 31,
           "version": 2,
           "language": 0,
           "description": "xd",
           "hero_build_id": 4148,
           "origin_build_id": 1,
           "author_account_id": 105454199,
           "last_updated_timestamp": 1723584968
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 0,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (10, 143024, 1, 84097742, 1, 0, 0, '2024-11-03 23:27:08.000000', '{
         "hero_build": {
           "name": "Carrydox v.1 (use if no carry on team)",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 2
                 },
                 {
                   "delta": -2,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 58655583,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1128670012,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 1366719170,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 2917891787,
                   "annotation": null,
                   "currency_type": 1
                 }
               ]
             },
             "mod_categories": [
               {
                 "mods": [
                   {
                     "ability_id": 2010028405,
                     "annotation": ""
                   },
                   {
                     "ability_id": 395867183,
                     "annotation": null
                   },
                   {
                     "ability_id": 1009965641,
                     "annotation": "Sell for lategame when farming is easy"
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": "upgrade when necessary"
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": "makes bomba hit camps easier. sell later if not needed or losing badly for spike."
                   },
                   {
                     "ability_id": 1797283378,
                     "annotation": "Buy last when laning phase ends. sell for any lategame when farming becomes easy. Use to farm big camps."
                   }
                 ],
                 "name": "Early",
                 "width": 663.0,
                 "height": 159.0,
                 "description": "Buy first left to right"
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   },
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   }
                 ],
                 "name": "Situational Early",
                 "width": 354.0,
                 "height": 147.0,
                 "description": "Buy if losing or need regen"
               },
               {
                 "mods": [
                   {
                     "ability_id": 811521119,
                     "annotation": "improves farming rate significantly. Enables big camp farm."
                   },
                   {
                     "ability_id": 2951612397,
                     "annotation": null
                   },
                   {
                     "ability_id": 4053935515,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 1292979587,
                     "annotation": "imbue 3"
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   }
                 ],
                 "name": "Mid (big farma)",
                 "width": 663.0,
                 "height": 142.0,
                 "description": "Buy tesla first, duration second. Any order next, begin farming camps."
               },
               {
                 "mods": [
                   {
                     "ability_id": 3270001687,
                     "annotation": null
                   },
                   {
                     "ability_id": 3403085434,
                     "annotation": null
                   }
                 ],
                 "name": "Situational Mid",
                 "width": 355.0,
                 "height": 149.0,
                 "description": "Buy if need to enter fights early"
               },
               {
                 "mods": [
                   {
                     "ability_id": 365620721,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 2820116164,
                     "annotation": null
                   },
                   {
                     "ability_id": 2121044373,
                     "annotation": null
                   },
                   {
                     "ability_id": 2717651715,
                     "annotation": "imbue bomba"
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   }
                 ],
                 "name": "Late game",
                 "width": 662.0,
                 "height": 160.0,
                 "description": "Come out of the jungle, my child, buy any order"
               },
               {
                 "mods": [
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   }
                 ],
                 "name": "Situational Late",
                 "width": 358.0,
                 "height": 168.0,
                 "description": "Buy for specific character counter"
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
                     "ability_id": 499683006,
                     "annotation": null
                   },
                   {
                     "ability_id": 2226497419,
                     "annotation": "Only buy if absurdly ahead and trying to close game early to get home for dinner"
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   },
                   {
                     "ability_id": 630839635,
                     "annotation": "only for ultra gamers. Buy to make bomba build stupid and funny."
                   },
                   {
                     "ability_id": 3005970438,
                     "annotation": "Very good item for bomb tags"
                   }
                 ],
                 "name": "Comfort Buys",
                 "width": 1030.0,
                 "height": null,
                 "description": "Use these buys to fill as needed, won''t be much room for weapon ones"
               }
             ]
           },
           "hero_id": 10,
           "version": 1,
           "language": 0,
           "description": "run it if no carry on team. Paradox is a terrible carry, but someone has to do it.",
           "hero_build_id": 143024,
           "origin_build_id": 133416,
           "author_account_id": 84097742,
           "last_updated_timestamp": 1730676428
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (19, 189977, 1, 18363, 1, 0, 0, '2025-01-09 00:07:56.000000', '{
         "hero_build": {
           "name": "0n3sh0t Shiv",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 1458044103,
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
                   "ability_id": 2460791803,
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
                   "delta": -2,
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
                   "ability_id": 1537272748,
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
                   "delta": -1,
                   "ability_id": 2460791803,
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
                     "ability_id": 3862866912,
                     "annotation": null
                   },
                   {
                     "ability_id": 1342610602,
                     "annotation": null
                   },
                   {
                     "ability_id": 668299740,
                     "annotation": null
                   },
                   {
                     "ability_id": 381961617,
                     "annotation": null
                   }
                 ],
                 "name": "First Orange Items",
                 "width": 504.0,
                 "height": 156.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 1710079648,
                     "annotation": null
                   },
                   {
                     "ability_id": 2829638276,
                     "annotation": null
                   }
                 ],
                 "name": "Do you need Extra Heal",
                 "width": 250.5,
                 "height": 118.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1437614329,
                     "annotation": null
                   },
                   {
                     "ability_id": 3633614685,
                     "annotation": null
                   },
                   {
                     "ability_id": 3399065363,
                     "annotation": null
                   },
                   {
                     "ability_id": 4139877411,
                     "annotation": null
                   }
                 ],
                 "name": "Buy Green First",
                 "width": 507.0,
                 "height": 134.25,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1248737459,
                     "annotation": null
                   },
                   {
                     "ability_id": 754480263,
                     "annotation": null
                   },
                   {
                     "ability_id": 1925087134,
                     "annotation": null
                   },
                   {
                     "ability_id": 380806748,
                     "annotation": null
                   }
                 ],
                 "name": "First Purple Items",
                 "width": 623.25,
                 "height": 145.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1644605047,
                     "annotation": null
                   },
                   {
                     "ability_id": 1047818222,
                     "annotation": null
                   },
                   {
                     "ability_id": 3713423303,
                     "annotation": null
                   },
                   {
                     "ability_id": 2971868509,
                     "annotation": null
                   },
                   {
                     "ability_id": 223594321,
                     "annotation": null
                   },
                   {
                     "ability_id": 2163598980,
                     "annotation": null
                   },
                   {
                     "ability_id": 3140772621,
                     "annotation": null
                   },
                   {
                     "ability_id": 3731635960,
                     "annotation": null
                   },
                   {
                     "ability_id": 3357231760,
                     "annotation": null
                   }
                 ],
                 "name": "Need D?",
                 "width": 1003.5,
                 "height": 154.5,
                 "description": null
               },
               {
                 "mods": [
                   {
                     "ability_id": 1414319208,
                     "annotation": null
                   },
                   {
                     "ability_id": 2481177645,
                     "annotation": null
                   },
                   {
                     "ability_id": 2095565695,
                     "annotation": null
                   },
                   {
                     "ability_id": 499683006,
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
                     "ability_id": 2059712766,
                     "annotation": null
                   },
                   {
                     "ability_id": 3144988365,
                     "annotation": null
                   },
                   {
                     "ability_id": 1813726886,
                     "annotation": null
                   },
                   {
                     "ability_id": 3977876567,
                     "annotation": null
                   },
                   {
                     "ability_id": 2108215830,
                     "annotation": null
                   },
                   {
                     "ability_id": 3361075077,
                     "annotation": null
                   }
                 ],
                 "name": "Additional Items to Consider",
                 "width": 984.0,
                 "height": 299.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182,
                     "annotation": null
                   },
                   {
                     "ability_id": 2064029594,
                     "annotation": null
                   },
                   {
                     "ability_id": 3261353684,
                     "annotation": null
                   },
                   {
                     "ability_id": 3585132399,
                     "annotation": null
                   },
                   {
                     "ability_id": 865846625,
                     "annotation": null
                   },
                   {
                     "ability_id": 1378931225,
                     "annotation": null
                   },
                   {
                     "ability_id": 2533252781,
                     "annotation": null
                   }
                 ],
                 "name": "Update Some Items or Gear",
                 "width": 1005.0,
                 "height": 146.0,
                 "description": ""
               },
               {
                 "mods": [
                   {
                     "ability_id": 339443430,
                     "annotation": null
                   },
                   {
                     "ability_id": 3884003354,
                     "annotation": null
                   },
                   {
                     "ability_id": 2407781327,
                     "annotation": null
                   },
                   {
                     "ability_id": 2037039379,
                     "annotation": null
                   },
                   {
                     "ability_id": 1282141666,
                     "annotation": null
                   }
                 ],
                 "name": "Buy Last",
                 "width": 1006.0,
                 "height": 133.0,
                 "description": ""
               }
             ]
           },
           "hero_id": 19,
           "version": 1,
           "language": 0,
           "description": "Updated",
           "hero_build_id": 189977,
           "origin_build_id": 187815,
           "author_account_id": 18363,
           "last_updated_timestamp": 1736381276
         },
         "preference": null,
         "num_ignores": null,
         "num_reports": null,
         "num_favorites": 1,
         "rollup_category": null,
         "num_daily_favorites": null,
         "num_weekly_favorites": null
       }', 0, 0, null),
       (17, 190264, 12, 263443668, 0, 0, 0, '2025-02-16 11:33:11.000000', '{
         "hero_build": {
           "name": "Talon FaxFox",
           "details": {
             "ability_order": {
               "currency_changes": [
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "currency_type": 2
                 },
                 {
                   "delta": -1,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 548943648,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3242902780,
                   "currency_type": 1
                 },
                 {
                   "delta": -1,
                   "ability_id": 512733154,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 3452399392,
                   "currency_type": 1
                 },
                 {
                   "delta": -2,
                   "ability_id": 512733154,
                   "currency_type": 1
                 },
                 {
                   "delta": -5,
                   "ability_id": 512733154,
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
                     "ability_id": 2678489038
                   },
                   {
                     "ability_id": 3776945997
                   },
                   {
                     "ability_id": 968099481
                   },
                   {
                     "ability_id": 1998374645
                   },
                   {
                     "ability_id": 558396679
                   },
                   {
                     "ability_id": 4139877411
                   }
                 ],
                 "name": "lane",
                 "width": 770.0,
                 "height": 172.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2829638276
                   },
                   {
                     "ability_id": 1710079648
                   }
                 ],
                 "name": "heal",
                 "width": 232.0,
                 "height": 132.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 3331811235
                   },
                   {
                     "ability_id": 4104549924
                   },
                   {
                     "ability_id": 3970837787
                   },
                   {
                     "ability_id": 1235347618
                   },
                   {
                     "ability_id": 380806748
                   }
                 ],
                 "name": "early",
                 "width": 580.0,
                 "height": 148.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 1292979587
                   },
                   {
                     "ability_id": 7409189
                   },
                   {
                     "ability_id": 2121044373
                   },
                   {
                     "ability_id": 787198704
                   }
                 ],
                 "name": "mid",
                 "width": 450.0,
                 "height": 92.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2739107182
                   },
                   {
                     "ability_id": 2064029594
                   },
                   {
                     "ability_id": 2152872419
                   },
                   {
                     "ability_id": 334300056
                   },
                   {
                     "ability_id": 2533252781
                   }
                 ],
                 "name": "mid option",
                 "width": 558.0,
                 "height": 151.0
               },
               {
                 "mods": [
                   {
                     "ability_id": 2226497419
                   },
                   {
                     "ability_id": 3612042342
                   },
                   {
                     "ability_id": 869090587
                   },
                   {
                     "ability_id": 3357231760
                   }
                 ],
                 "name": "late",
                 "width": 458.0,
                 "height": 144.0
               }
             ]
           },
           "hero_id": 17,
           "version": 12,
           "language": 4,
           "description": "aay",
           "hero_build_id": 190264,
           "origin_build_id": 172172,
           "author_account_id": 263443668,
           "last_updated_timestamp": 1739705591
         },
         "rollup_category": 2,
         "num_weekly_favorites": 4
       }', 4, 4, 2);
