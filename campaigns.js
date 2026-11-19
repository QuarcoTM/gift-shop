/** Shared seasonal copy. The names/slugs below are presentation presets, not inventory. */
export const CAMPAIGNS = Object.freeze({
  christmas: {
    image:"./assets/images/christmas.webp", heroTitle:"Коледа, която<br/>събира <em>сърцата.</em>", heroSubtitle:"Празнични подаръци, които носят настроение и радост.",
    label:"Коледа", slug:"koleda", nav:"Коледа", announcement:"Коледна колекция",
    heroButton:"За Коледа", cardTitle:"Коледа,<br />с много обич.",
    eyebrow:"Празнична колекция", title:"Коледа е в<br /><em>споделената радост.</em>",
    description:"Празнични подаръци, готови да зарадват.", button:"Виж коледните подаръци",
    collectionTitle:"Коледа с <em>повече сърце.</em>",
    collectionSubtitle:"Празнични подаръци за незабравими моменти.", mark:"✦"
  },
  new_year: {
    // Original New Year gift-box photography in the same visual style as other holidays.
    image:"./assets/images/new_year.avif", heroTitle:"Нова година,<br/><em>нови желания.</em>", heroSubtitle:"Подаръци за посрещането на Нова година и началото на нещо хубаво.",
    label:"Нова година", slug:"nova-godina", nav:"Нова година", announcement:"Новогодишна колекция",
    heroButton:"За Нова година", cardTitle:"Нова година,<br />ново начало.",
    eyebrow:"Новогодишна колекция", title:"Нова година.<br /><em>Нови поводи за радост.</em>",
    description:"Подаръци за новогодишните празници.", button:"Виж новогодишните подаръци",
    collectionTitle:"Нова година с <em>ново настроение.</em>",
    collectionSubtitle:"Подаръци за посрещането на Нова година.", mark:"✦"
  },
  easter: {
    image:"./assets/images/easter.webp", heroTitle:"Великден с<br/><em>повече светлина.</em>", heroSubtitle:"Пролетно настроение и подаръци, споделени с обич.",
    label:"Великден", slug:"velikden", nav:"Великден", announcement:"Великденска колекция",
    heroButton:"За Великден", cardTitle:"Великден,<br />споделен с обич.",
    eyebrow:"Пролетна колекция", title:"Великден е в<br /><em>споделените жестове.</em>",
    description:"Пролетни подаръци за любимите хора.", button:"Виж великденските подаръци",
    collectionTitle:"Великден с <em>повече сърце.</em>",
    collectionSubtitle:"Пролетни подаръци за споделени моменти.", mark:"В"
  },
  valentine: {
    image:"./assets/images/valentine.webp", heroTitle:"Любовта се<br/>познава по <em>жестовете.</em>", heroSubtitle:"Изненади за човека, който прави всеки ден специален.",
    label:"Свети Валентин", slug:"sveti-valentin", nav:"Свети Валентин", announcement:"Колекция за любовта",
    heroButton:"За любовта", cardTitle:"Любовта,<br />събрана в подарък.",
    eyebrow:"За любимите хора", title:"Любовта е в<br /><em>личното внимание.</em>",
    description:"Нежни жестове, които казват повече.", button:"Виж подаръците за любовта",
    collectionTitle:"За любовта <em>с внимание.</em>",
    collectionSubtitle:"Подаръци за Свети Валентин и всеки ден.", mark:"♥"
  },
  womens_day: {
    image:"./assets/images/womens_day.webp", heroTitle:"За нея.<br/>С <em>благодарност.</em>", heroSubtitle:"Красиви жестове за жените, които ни вдъхновяват.",
    label:"8 март", slug:"osmi-mart", nav:"8 март", announcement:"Подаръци за 8 март",
    heroButton:"За 8 март", cardTitle:"За нея,<br />с много обич.",
    eyebrow:"С благодарност към нея", title:"Благодаря,<br /><em>казано с подарък.</em>",
    description:"Подаръци за жените, които обичаме.", button:"Виж подаръците за 8 март",
    collectionTitle:"8 март <em>от сърце.</em>",
    collectionSubtitle:"Подаръци, с които да я зарадваш.", mark:"8"
  },
  martenitsa: {
    image:"./assets/images/martenitsa.webp", heroTitle:"Добре дошла,<br/><em>Баба Марта.</em>", heroSubtitle:"Пожелания за здраве, късмет и пролетно настроение.",
    label:"Баба Марта", slug:"baba-marta", nav:"Баба Марта", announcement:"Колекция Баба Марта",
    heroButton:"За Баба Марта", cardTitle:"За късмет,<br />с обич.",
    eyebrow:"Подаръци за пролетта", title:"Пролетта идва<br /><em>с настроение.</em>",
    description:"Подаръци с пожелание за здраве и късмет.", button:"Виж пролетните подаръци",
    collectionTitle:"Баба Марта <em>с усмивка.</em>",
    collectionSubtitle:"Подаръци за здраве и късмет.", mark:"М"
  },
  everyday: {
    image:"./assets/images/everyday.webp", heroTitle:"Всеки повод<br/><em>е специален.</em>", heroSubtitle:"Подаръци, които оставят впечатление. За личните поводи и спонтанните изненади.",
    label:"Обща визия", slug:"povodi", nav:"За поводи", announcement:"Подаръци за всеки повод",
    heroButton:"За всеки повод", cardTitle:"Подаръци.<br />Истински емоции.",
    eyebrow:"Всеки ден е повод", title:"Всеки ден е<br /><em>повод за радост.</em>",
    description:"Подаръци за всеки човек и всеки повод.", button:"Разгледай подаръците",
    collectionTitle:"Всеки повод <em>заслужава радост.</em>",
    collectionSubtitle:"Красиви подаръци за специални моменти.", mark:"✦"
  }
});
export const campaignOf = (key) => CAMPAIGNS[key] || CAMPAIGNS.christmas;
