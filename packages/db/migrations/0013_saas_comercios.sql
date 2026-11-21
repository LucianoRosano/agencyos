CREATE TABLE "shop" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'base' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "shop_status" CHECK ("shop"."status" in ('active','suspended'))
);
--> statement-breakpoint
CREATE TABLE "shop_customer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"doc" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "shop_invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'seller' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'seller' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_member_role" CHECK ("shop_member"."role" in ('owner','admin','seller'))
);
--> statement-breakpoint
CREATE TABLE "shop_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"number" integer NOT NULL,
	"customer_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"channel" text DEFAULT 'local' NOT NULL,
	"delivery_date" date,
	"notes" text,
	"total" numeric(14, 2) NOT NULL,
	"sale_id" uuid,
	CONSTRAINT "shop_order_status_chk" CHECK ("shop_order"."status" in ('new','preparing','ready','delivered','cancelled')),
	CONSTRAINT "shop_order_channel" CHECK ("shop_order"."channel" in ('local','whatsapp','web','phone','instagram','other'))
);
--> statement-breakpoint
CREATE TABLE "shop_order_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"sku" text,
	"barcode" text,
	"name" text NOT NULL,
	"category" text,
	"price" numeric(14, 2) NOT NULL,
	"cost" numeric(14, 2),
	"stock" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"data" jsonb NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sale" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"number" integer NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "shop_sale_status" CHECK ("shop_sale"."status" in ('completed','cancelled')),
	CONSTRAINT "shop_sale_payment" CHECK ("shop_sale"."payment_method" in ('cash','debit','credit','transfer','mercadopago','other'))
);
--> statement-breakpoint
CREATE TABLE "shop_sale_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(14, 2),
	"line_total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_stock_move" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" uuid,
	"note" text,
	"stock_after" integer NOT NULL,
	"created_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_stock_reason" CHECK ("shop_stock_move"."reason" in ('sale','sale_cancel','purchase','adjust','return','initial'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shop_slug" ON "shop" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "shop_ws" ON "shop" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "shop_customer_shop" ON "shop_customer" USING btree ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_invitation_token" ON "shop_invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "shop_invitation_shop" ON "shop_invitation" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_member_unique" ON "shop_member" USING btree ("shop_id","user_id");--> statement-breakpoint
CREATE INDEX "shop_member_user" ON "shop_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_number" ON "shop_order" USING btree ("shop_id","number");--> statement-breakpoint
CREATE INDEX "shop_order_status" ON "shop_order" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "shop_order_item_order" ON "shop_order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shop_product_shop" ON "shop_product" USING btree ("shop_id","active","name");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_product_sku" ON "shop_product" USING btree ("shop_id","sku") WHERE "shop_product"."sku" is not null;--> statement-breakpoint
CREATE INDEX "shop_product_barcode" ON "shop_product" USING btree ("shop_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_report_period" ON "shop_report" USING btree ("shop_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_sale_number" ON "shop_sale" USING btree ("shop_id","number");--> statement-breakpoint
CREATE INDEX "shop_sale_day" ON "shop_sale" USING btree ("shop_id","day");--> statement-breakpoint
CREATE INDEX "shop_sale_item_sale" ON "shop_sale_item" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "shop_sale_item_product" ON "shop_sale_item" USING btree ("shop_id","product_id");--> statement-breakpoint
CREATE INDEX "shop_stock_move_product" ON "shop_stock_move" USING btree ("product_id","at");