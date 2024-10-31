FROM python:3.13

WORKDIR /app

COPY requirements.txt requirements.txt

RUN pip install -r requirements.txt

COPY mmr_calc.py .

CMD ["python", "mmr_calc.py"]
