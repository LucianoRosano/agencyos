CREATE TABLE "fx_rate" (
	"day" date NOT NULL,
	"source" text NOT NULL,
	"buy" numeric(14, 4),
	"sell" numeric(14, 4),
	"quoted_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_day_source_pk" PRIMARY KEY("day","source")
);
