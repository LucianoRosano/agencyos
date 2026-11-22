CREATE TABLE "shop_customer_payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"customer_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"day" date NOT NULL,
	CONSTRAINT "shop_customer_payment_amount" CHECK ("shop_customer_payment"."amount" > 0),
	CONSTRAINT "shop_customer_payment_method" CHECK ("shop_customer_payment"."method" in ('cash','debit','credit','transfer','mercadopago','other'))
);
--> statement-breakpoint
ALTER TABLE "shop_sale" DROP CONSTRAINT "shop_sale_payment";--> statement-breakpoint
CREATE INDEX "shop_customer_payment_customer" ON "shop_customer_payment" USING btree ("shop_id","customer_id");--> statement-breakpoint
CREATE INDEX "shop_customer_payment_day" ON "shop_customer_payment" USING btree ("shop_id","day");--> statement-breakpoint
ALTER TABLE "shop_sale" ADD CONSTRAINT "shop_sale_payment" CHECK ("shop_sale"."payment_method" in ('cash','debit','credit','transfer','mercadopago','other','account'));