#!/usr/bin/env python3
"""Rezonans Telegram bot — aiogram 3.x"""
import asyncio
import json
import logging
import os
import re
from urllib.parse import urlparse, urlunparse

import aiohttp
import pytz
from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_BASE = os.getenv("API_BASE_URL", "http://localhost:4000").rstrip("/")
INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "")
ADMIN_KEY = os.getenv("ADMIN_API_KEY", "")
WEB_URL = os.getenv("PUBLIC_WEB_URL", "http://localhost:5173").rstrip("/")
MINI_APP_TME = os.getenv("TELEGRAM_MINIAPP_TME", "").strip()
MSK = pytz.timezone("Europe/Moscow")

if not BOT_TOKEN:
    log.warning("TELEGRAM_BOT_TOKEN не задан")

# ── FSM ───────────────────────────────────────────────────────────────────────
class Onboard(StatesGroup):
    name = State()
    age = State()
    workplace = State()


# ── Keyboards ─────────────────────────────────────────────────────────────────
MAIN_KB = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="❓ Вопрос-ответ"), KeyboardButton(text="🛟 Поддержка")],
        [KeyboardButton(text="📱 Мини-апп"), KeyboardButton(text="📍 Маршрут до места")],
    ],
    resize_keyboard=True,
)


# ── HTTP helpers ──────────────────────────────────────────────────────────────
async def _req(method: str, path: str, *, body=None, headers=None) -> dict:
    h = {"content-type": "application/json", **(headers or {})}
    async with aiohttp.ClientSession() as s:
        kwargs: dict = {"headers": h}
        if body is not None:
            kwargs["json"] = body
        async with s.request(method, f"{API_BASE}{path}", **kwargs) as r:
            data = await r.json()
            if not r.ok:
                raise RuntimeError(f"HTTP {r.status} {path}: {data}")
            return data


async def api_get(path: str, headers=None) -> dict:
    return await _req("GET", path, headers=headers)


async def api_post(path: str, body: dict, headers=None) -> dict:
    return await _req("POST", path, body=body, headers=headers)


async def api_patch(path: str, body: dict, headers=None) -> dict:
    return await _req("PATCH", path, body=body, headers=headers)


async def upsert_user(from_user) -> dict:
    payload: dict = {"telegramId": str(from_user.id)}
    if from_user.username:
        payload["username"] = from_user.username
    if from_user.first_name:
        payload["firstName"] = from_user.first_name
    if from_user.last_name:
        payload["lastName"] = from_user.last_name
    return await api_post("/api/users/upsert", payload)


async def is_admin(tid: str) -> bool:
    try:
        admins = await api_get("/api/admin/bot/admins", {"x-admin-key": ADMIN_KEY})
        return any(a["telegramId"] == tid for a in admins)
    except Exception:
        return False


def mini_app_link(day: int) -> str | None:
    if not MINI_APP_TME:
        return None
    base = MINI_APP_TME if MINI_APP_TME.startswith("http") else f"https://{MINI_APP_TME}"
    try:
        p = urlparse(base)
        host = (p.hostname or "").lower()
        if host not in ("t.me", "telegram.me") and not host.endswith(".t.me"):
            return None
        if len([x for x in p.path.split("/") if x]) < 2:
            return None
        return urlunparse((p.scheme, p.netloc, p.path, "", f"startapp={day}", ""))
    except Exception:
        return None


# ── Onboarding helpers ────────────────────────────────────────────────────────
async def _ask_name(target: Message, state: FSMContext):
    await state.set_state(Onboard.name)
    await target.answer(
        "Отлично! Теперь введи своё *ФИО* (Фамилия Имя Отчество):",
        reply_markup=ReplyKeyboardRemove(),
    )


async def _ask_age(target: Message, state: FSMContext):
    await state.set_state(Onboard.age)
    await target.answer("Сколько тебе лет?")


async def _ask_workplace(target: Message, state: FSMContext):
    await state.set_state(Onboard.workplace)
    await target.answer(
        "Где ты учишься или работаешь?\n"
        "_Можно написать ВУЗ, компанию, «фриланс» или «другое»_"
    )


async def _finish_onboard(target: Message, state: FSMContext):
    await state.clear()
    await target.answer(
        "✅ Всё готово! Добро пожаловать в кампанию «Резонанс» 🎉\n\nВот главное меню:",
        reply_markup=MAIN_KB,
    )


async def _run_onboard(target: Message, state: FSMContext, profile: dict):
    """Запускает онбординг с нужного шага или приветствует вернувшегося пользователя."""
    if not profile.get("pdConsentAt"):
        await target.answer(
            "👋 Привет! Прежде чем начать — нам нужно твоё согласие на обработку персональных данных.\n\n"
            "Мы сохраним твои ФИО, возраст и место учёбы/работы для организации кампании «Резонанс». "
            "Данные используются только внутри проекта и не передаются третьим лицам.",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[
                    InlineKeyboardButton(text="✅ Да, согласен(на)", callback_data="pd_consent"),
                ]]
            ),
        )
        return
    if not profile.get("fullName"):
        await _ask_name(target, state)
        return
    if profile.get("age") is None:
        await _ask_age(target, state)
        return
    if not profile.get("university"):
        await _ask_workplace(target, state)
        return
    await target.answer("С возвращением! Вот главное меню:", reply_markup=MAIN_KB)


# ── Bot & Dispatcher ──────────────────────────────────────────────────────────
bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN),
)
dp = Dispatcher(storage=MemoryStorage())


# ── /start ────────────────────────────────────────────────────────────────────
@dp.message(CommandStart())
async def on_start(msg: Message, state: FSMContext):
    profile = await upsert_user(msg.from_user)
    await _run_onboard(msg, state, profile)


# ── /menu ─────────────────────────────────────────────────────────────────────
@dp.message(Command("menu"))
async def on_menu(msg: Message, state: FSMContext):
    profile = await upsert_user(msg.from_user)
    await _run_onboard(msg, state, profile)


# ── pd_consent callback ───────────────────────────────────────────────────────
@dp.callback_query(F.data == "pd_consent")
async def on_consent(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    tid = str(cb.from_user.id)
    await api_patch(f"/api/users/{tid}/profile", {"pdConsent": True})
    await _ask_name(cb.message, state)


# ── Onboarding FSM ────────────────────────────────────────────────────────────
@dp.message(Onboard.name)
async def fsm_name(msg: Message, state: FSMContext):
    text = (msg.text or "").strip()
    if len(text.split()) < 2:
        await msg.answer("Пожалуйста, введи полное ФИО (минимум имя и фамилия):")
        return
    await api_patch(f"/api/users/{msg.from_user.id}/profile", {"fullName": text})
    await _ask_age(msg, state)


@dp.message(Onboard.age)
async def fsm_age(msg: Message, state: FSMContext):
    try:
        age = int((msg.text or "").strip())
        assert 10 <= age <= 120
    except (ValueError, AssertionError):
        await msg.answer("Введи корректный возраст числом, например: 21")
        return
    await api_patch(f"/api/users/{msg.from_user.id}/profile", {"age": age})
    await _ask_workplace(msg, state)


@dp.message(Onboard.workplace)
async def fsm_workplace(msg: Message, state: FSMContext):
    text = (msg.text or "").strip()
    await api_patch(f"/api/users/{msg.from_user.id}/profile", {"university": text})
    await _finish_onboard(msg, state)


# ── /broadcast ────────────────────────────────────────────────────────────────
@dp.message(Command("broadcast"))
async def on_broadcast(msg: Message):
    tid = str(msg.from_user.id)
    if not await is_admin(tid):
        await msg.answer("⛔ Нет доступа.")
        return
    text = re.sub(r"^/broadcast\s*", "", msg.text or "").strip()
    if not text:
        await msg.answer("Использование: /broadcast Текст сообщения")
        return
    try:
        await api_post("/api/admin/bot/broadcasts", {"message": text}, {"x-admin-key": ADMIN_KEY})
        await msg.answer("✅ Рассылка поставлена в очередь.")
    except Exception:
        await msg.answer("❌ Ошибка при создании рассылки.")


# ── FAQ ───────────────────────────────────────────────────────────────────────
@dp.message(F.text == "❓ Вопрос-ответ")
async def on_faq(msg: Message):
    site = await api_get("/api/site")
    raw = site.get("faq_json")
    if not raw:
        await msg.answer("Раздел скоро пополним.")
        return
    faq = json.loads(raw)
    if not faq:
        await msg.answer("Раздел скоро пополним.")
        return
    chunks: list[str] = []
    buf = "❓ *Вопросы и ответы*\n\n"
    for i, item in enumerate(faq):
        block = f"*{i + 1}. {item['q']}*\n{item['a']}\n\n"
        if len(buf) + len(block) > 3800:
            chunks.append(buf.strip())
            buf = block
        else:
            buf += block
    if buf.strip():
        chunks.append(buf.strip())
    for chunk in chunks:
        await msg.answer(chunk)


# ── Support ───────────────────────────────────────────────────────────────────
@dp.message(F.text == "🛟 Поддержка")
async def on_support(msg: Message):
    site = await api_get("/api/site")
    hint = "В случае проблем напишите в предложку канала @rezonans_sport"
    custom = (site.get("support_text") or "").strip()
    await msg.answer(f"{custom}\n\n{hint}" if custom else hint)


# ── Route ─────────────────────────────────────────────────────────────────────
@dp.message(F.text == "📍 Маршрут до места")
async def on_route(msg: Message):
    caption = (
        "*Адрес:* Москва, Малый Златоустинский пер., 7, стр. 1\n\n"
        "🗺 Открыть в картах:\n"
        "[Яндекс Карты](https://yandex.ru/maps/?text=Малый+Златоустинский+пер.+7+стр.+1+Москва) · "
        "[Google Maps](https://maps.google.com/?q=Малый+Златоустинский+пер.+7+стр.+1,+Москва)"
    )
    try:
        await msg.answer_photo(f"{WEB_URL}/route-map.png", caption=caption)
    except Exception:
        await msg.answer(caption)


# ── Mini App ──────────────────────────────────────────────────────────────────
@dp.message(F.text == "📱 Мини-апп")
async def on_mini_app(msg: Message):
    await msg.answer(
        "Открой мини-приложение кнопкой ниже — так Telegram передаст данные для входа.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[
                InlineKeyboardButton(text="📱 Открыть Мини-апп", web_app=WebAppInfo(url=WEB_URL)),
            ]]
        ),
    )


# ── Advent calendar (legacy bot flow) ─────────────────────────────────────────
def _advent_grid(current: int | None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for d in range(1, 22):
        unlocked = current is not None and d <= current
        label = str(d) if unlocked else f"🔒{d}"
        row.append(InlineKeyboardButton(text=label, callback_data=f"advent:{d}"))
        if d % 7 == 0:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


@dp.message(F.text == "🎄 Адвент")
async def on_advent(msg: Message):
    tid = str(msg.from_user.id)
    data = await api_get(f"/api/users/{tid}/advent")
    cur = data.get("currentAdventDay")
    lines = []
    for d in data.get("days", []):
        prog = d.get("progress") or {}
        icon = "✅" if prog.get("taskCompletedAt") else ("○" if d.get("unlocked") else "🔒")
        lines.append(f"{icon} {d['day']}. {d['title']}")
    await msg.answer(
        f"Адвент-календарь (сегодняшний день: {cur or 'вне окна'})\n\n"
        + "\n".join(lines)
        + "\n\nНажмите номер дня ниже:",
        reply_markup=_advent_grid(cur),
    )


@dp.callback_query(F.data.regexp(r"^advent:(\d+)$"))
async def on_advent_day(cb: CallbackQuery):
    day = int(cb.data.split(":")[1])
    tid = str(cb.from_user.id)
    data = await api_get(f"/api/users/{tid}/advent")
    d = next((x for x in data.get("days", []) if x["day"] == day), None)
    if not d:
        await cb.answer("Нет данных")
        return
    if not d.get("unlocked"):
        await cb.answer("Ещё не открыт")
        return

    await api_post(f"/api/users/{tid}/advent/{day}/view", {})

    if d.get("miniQuizQuestionCount", 0) > 0:
        link = mini_app_link(day)
        if link:
            await cb.answer()
            await cb.message.answer(f"Открыть день {day} в Mini App: {link}")
        else:
            await cb.answer(
                "Задайте TELEGRAM_MINIAPP_TME — тогда день откроется в Mini App.",
                show_alert=True,
            )
        return

    await cb.answer()

    text = f"📌 *{d['title']}*\n_{d.get('shortSummary', '')}_\n\n"
    if d.get("extraText"):
        text += f"{d['extraText']}\n\n"
    if d.get("articleUrl"):
        text += f"📰 Статья: {d['articleUrl']}\n"
    if d.get("videoUrl"):
        text += f"🎬 Видео: {d['videoUrl']}\n"
    prompt = (d.get("taskPrompt") or "").strip()
    text += f"\n*Задание:* {prompt}" if prompt else "\n*Задание:* подтвердите выполнение кнопкой ниже."

    prog = d.get("progress") or {}
    if prog.get("taskCompletedAt"):
        await cb.message.answer(text + "\n\n✅ Задание уже выполнено.")
        return

    if d.get("taskKind") == "QUIZ" and d.get("quizOptions"):
        opts = d["quizOptions"]
        kb_rows = [
            [InlineKeyboardButton(text=f"Вариант {i + 1}", callback_data=f"quiz:{day}:{i}")]
            for i in range(len(opts))
        ]
    else:
        kb_rows = [[InlineKeyboardButton(text="Подтверждаю", callback_data=f"conf:{day}")]]

    await cb.message.answer(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=kb_rows))


@dp.callback_query(F.data.regexp(r"^quiz:(\d+):(\d+)$"))
async def on_quiz(cb: CallbackQuery):
    parts = cb.data.split(":")
    day, idx = int(parts[1]), int(parts[2])
    try:
        await api_post(
            f"/api/users/{cb.from_user.id}/advent/{day}/task",
            {"quizAnswerIndex": idx},
        )
        await cb.answer("Отлично!")
        await cb.message.answer("✅ Задание принято!")
    except Exception:
        await cb.answer("Пока неверно — попробуйте другой вариант.")


@dp.callback_query(F.data.regexp(r"^conf:(\d+)$"))
async def on_confirm(cb: CallbackQuery):
    day = int(cb.data.split(":")[1])
    try:
        await api_post(
            f"/api/users/{cb.from_user.id}/advent/{day}/task",
            {"confirm": True},
        )
        await cb.answer("Принято!")
        await cb.message.answer("✅ Задание засчитано.")
    except Exception:
        await cb.answer("Не удалось сохранить.")


@dp.callback_query(F.data == "noop")
async def on_noop(cb: CallbackQuery):
    await cb.answer()


# ── Trainings (legacy handlers, не в основной клавиатуре) ─────────────────────
@dp.message(F.text == "🏋️ Тренировки")
async def on_trainings(msg: Message):
    tlist = await api_get("/api/trainings")
    if not tlist:
        await msg.answer("Пока нет доступных тренировок.")
        return
    rows = [
        [InlineKeyboardButton(text=t["title"], callback_data=f"train:{t['id']}")]
        for t in tlist
    ]
    await msg.answer("Выберите тренировку:", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@dp.callback_query(F.data.regexp(r"^train:(.+)$"))
async def on_train_detail(cb: CallbackQuery):
    training_id = cb.data.split(":", 1)[1]
    tlist = await api_get("/api/trainings")
    t = next((x for x in tlist if x["id"] == training_id), None)
    if not t:
        await cb.answer("Не найдено")
        return
    await cb.answer()
    from datetime import datetime, timezone as _tz
    when = (
        datetime.fromisoformat(t["startsAt"].replace("Z", "+00:00"))
        .astimezone(MSK)
        .strftime("%d.%m.%Y %H:%M")
    )
    await cb.message.answer(
        f"*{t['title']}*\n{t['description']}\n\n🕐 {when}\n📍 {t['location']}\n\nЗаписаться?",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[
                InlineKeyboardButton(text="Да, записать", callback_data=f"signup:{t['id']}"),
                InlineKeyboardButton(text="Отмена", callback_data="noop"),
            ]]
        ),
    )


@dp.callback_query(F.data.regexp(r"^signup:(.+)$"))
async def on_signup(cb: CallbackQuery):
    training_id = cb.data.split(":", 1)[1]
    await api_post(f"/api/users/{cb.from_user.id}/trainings/{training_id}", {})
    await cb.answer("Вы записаны!")
    await cb.message.answer("✅ Запись подтверждена.")


# ── Giveaways (legacy) ────────────────────────────────────────────────────────
@dp.message(F.text == "🎁 Розыгрыши")
async def on_giveaways(msg: Message):
    tid = str(msg.from_user.id)
    data = await api_get(f"/api/users/{tid}/giveaways")
    lines = []
    for g in data.get("giveaways", []):
        if g.get("participated"):
            st = "✅ вы участвуете"
        elif g.get("canEnter"):
            st = "можно вступить"
        elif g.get("eligible"):
            st = "лимит 3 розыгрыша"
        else:
            st = f"нужно дней за неделю: {g['minDaysInWeek']}, у вас: {g['completedDaysInWeek']}"
        lines.append(f"*{g['title']}* (неделя {g['campaignWeek']})\n_{st}_")
    total = data.get("totalGiveawayEntries", 0)
    await msg.answer(
        f"Участий использовано: {total} из 3.\n\n" + "\n\n".join(lines)
    )
    enterable = [g for g in data.get("giveaways", []) if g.get("canEnter")]
    if enterable:
        rows = [
            [InlineKeyboardButton(text=f"Вступить: {g['title']}", callback_data=f"gw:{g['id']}")]
            for g in enterable
        ]
        await msg.answer(
            "Выберите розыгрыш:", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows)
        )


@dp.callback_query(F.data.regexp(r"^gw:(\d+)$"))
async def on_giveaway_enter(cb: CallbackQuery):
    gid = int(cb.data.split(":")[1])
    try:
        await api_post(f"/api/users/{cb.from_user.id}/giveaways/{gid}/enter", {})
        await cb.answer("Вы в списке участников!")
        await cb.message.answer("Заявка принята. Удачи!")
    except Exception as e:
        await cb.answer("Нельзя", show_alert=True)
        await cb.message.answer(f"Не получилось: {e}")


# ── Cron jobs ─────────────────────────────────────────────────────────────────
def _internal_headers() -> dict:
    return {"x-internal-key": INTERNAL_KEY} if INTERNAL_KEY else {}


async def job_broadcast():
    """Рассылки из очереди — каждую минуту."""
    try:
        data = await api_get("/api/internal/pending-broadcast", _internal_headers())
    except Exception as e:
        log.error("pending-broadcast: %s", e)
        return
    if not data.get("broadcast"):
        return
    msg_text = data["broadcast"]["message"]
    tids = data.get("telegramIds", [])
    sent = 0
    for tid in tids:
        try:
            await bot.send_message(tid, msg_text)
            sent += 1
        except Exception:
            pass
    log.info("Broadcast: %d/%d sent", sent, len(tids))


# ── Entry point ───────────────────────────────────────────────────────────────
async def main():
    scheduler = AsyncIOScheduler(timezone=MSK)
    # Рассылки — каждую минуту
    scheduler.add_job(job_broadcast, CronTrigger(minute="*"))
    scheduler.start()
    log.info("Bot started")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


if __name__ == "__main__":
    asyncio.run(main())
