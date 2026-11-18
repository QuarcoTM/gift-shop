/** Shared seasonal copy. The names/slugs below are presentation presets, not inventory. */
export const CAMPAIGNS = Object.freeze({
  christmas: {
    image:"./assets/images/christmas.webp", heroTitle:"Коледа, която<br/>събира <em>сърцата.</em>", heroSubtitle:"Красиво подбрани малки изненади за най-топлите празнични моменти.",
    label:"Коледа", slug:"koleda", nav:"Коледа", announcement:"Коледна колекция",
    heroButton:"За Коледа", cardTitle:"Коледа,<br />събрана с обич.",
    eyebrow:"Празнична колекция", title:"Коледа е в<br /><em>малките неща.</em>",
    description:"Подбрани изненади, готови да зарадват.", button:"Виж коледните подаръци",
    collectionTitle:"Коледа с <em>повече сърце.</em>",
    collectionSubtitle:"Малки празнични изненади, подбрани с внимание.", mark:"✦"
  },
  easter: {
    image:"./assets/images/easter.webp", heroTitle:"Великден с<br/><em>повече светлина.</em>", heroSubtitle:"Пролетно настроение и подаръци, споделени с обич.",
    label:"Великден", slug:"velikden", nav:"Великден", announcement:"Великденска колекция",
    heroButton:"За Великден", cardTitle:"Великден,<br />споделен с обич.",
    eyebrow:"Пролетна колекция", title:"Великден е в<br /><em>споделените жестове.</em>",
    description:"Пролетни подаръци за любимите хора.", button:"Виж великденските подаръци",
    collectionTitle:"Великден с <em>повече сърце.</em>",
    collectionSubtitle:"Пролетни подаръци, подбрани с внимание.", mark:"В"
  },
  valentine: {
    image:"./assets/images/valentine.webp", heroTitle:"Любовта се<br/>познава по <em>жестовете.</em>", heroSubtitle:"Изненади за човека, който прави всеки ден специален.",
    label:"Свети Валентин", slug:"sveti-valentin", nav:"Свети Валентин", announcement:"Колекция за любовта",
    heroButton:"За любовта", cardTitle:"Любовта,<br />събрана в подарък.",
    eyebrow:"За любимите хора", title:"Любовта е в<br /><em>малките неща.</em>",
    description:"Нежни жестове, които казват повече.", button:"Виж подаръците за любовта",
    collectionTitle:"За любовта <em>с внимание.</em>",
    collectionSubtitle:"Подаръци за Свети Валентин и всеки ден.", mark:"♥"
  },
  womens_day: {
    image:"./assets/images/womens_day.webp", heroTitle:"За нея.<br/>С <em>благодарност.</em>", heroSubtitle:"Красиви жестове за жените, които ни вдъхновяват.",
    label:"8 март", slug:"osmi-mart", nav:"8 март", announcement:"Подаръци за 8 март",
    heroButton:"За 8 март", cardTitle:"За нея,<br />с много обич.",
    eyebrow:"С благодарност към нея", title:"Благодаря е в<br /><em>малките жестове.</em>",
    description:"Подаръци за жените, които обичаме.", button:"Виж подаръците за 8 март",
    collectionTitle:"8 март <em>от сърце.</em>",
    collectionSubtitle:"Внимателно подбрани подаръци за нея.", mark:"8"
  },
  martenitsa: {
    image:"./assets/images/martenitsa.webp", heroTitle:"Добре дошла,<br/><em>Баба Марта.</em>", heroSubtitle:"Малки пожелания за здраве, късмет и пролетно настроение.",
    label:"Баба Марта", slug:"baba-marta", nav:"Баба Марта", announcement:"Колекция Баба Марта",
    heroButton:"За Баба Марта", cardTitle:"За късмет,<br />с обич.",
    eyebrow:"Подаръци за пролетта", title:"Пролетта идва<br /><em>с малки радости.</em>",
    description:"Малки жестове за здраве и късмет.", button:"Виж пролетните подаръци",
    collectionTitle:"Баба Марта <em>с усмивка.</em>",
    collectionSubtitle:"Подаръци за здраве и късмет.", mark:"М"
  },
  everyday: {
    image:"./assets/images/everyday.webp", heroTitle:"Малките неща<br/>имат <em>значение.</em>", heroSubtitle:"Няколко внимателно подбрани неща. Един красив подарък. И много поводи за радост.",
    label:"Без празнична кампания", slug:"povodi", nav:"За поводи", announcement:"Подаръци за всеки повод",
    heroButton:"За всеки повод", cardTitle:"Малки жестове.<br />Големи чувства.",
    eyebrow:"Всеки ден е повод", title:"Радостта е в<br /><em>малките неща.</em>",
    description:"Подаръци за всеки човек и всеки повод.", button:"Разгледай подаръците",
    collectionTitle:"Всеки повод <em>заслужава радост.</em>",
    collectionSubtitle:"Красиви подаръци за специални моменти.", mark:"✦"
  }
});
export const campaignOf = (key) => CAMPAIGNS[key] || CAMPAIGNS.christmas;
